import { NextRequest, NextResponse } from "next/server";
import type { ApprovalDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyApprovalDecision } from "@/lib/pipeline/approval/apply-decision";
import { answerCallback, editMessageDecision, getFileUrl, sendText, sendMessageWithKeyboard } from "@/lib/pipeline/telegram/client";
import { formatApprovalSummary, excerpt } from "@/lib/pipeline/telegram/format";
import { applyImageSuggestion } from "@/lib/pipeline/image/suggestion";
import { notifyPublishApproval } from "@/lib/pipeline/approval/notify";
import { intakeText, intakeUrl } from "@/lib/pipeline/intake/editor-intake";
import { updatePostContent, updatePostTitle } from "@/lib/wordpress/posts";
import { parseEditReply } from "@/lib/pipeline/telegram/parse-edit";
import { toSlug } from "@/lib/pipeline/seo/generate-heuristic";
import { publishPostNow } from "@/lib/social/publish";
import { scheduleSocialPost } from "@/lib/social/schedule";
import { enqueue } from "@/lib/pipeline/queues/register";
import { notifySocialApproval } from "@/lib/pipeline/approval/notify";
import { sendPush } from "@/lib/push/send";
import { generatePush } from "@/lib/pipeline/push/generate";
import { recordDecision } from "@/lib/pipeline/logging/agent-decision";

/**
 * Webhook do Telegram. Recebe os cliques nos botões (callback_query). Segurança:
 *  - Valida o cabeçalho X-Telegram-Bot-Api-Secret-Token contra TELEGRAM_WEBHOOK_SECRET.
 *  - Só aceita utilizadores na allowlist TELEGRAM_ALLOWED_USER_IDS (se definida).
 * Instruções vêm SÓ do botão premido pelo utilizador autorizado — nunca do conteúdo.
 */

const VALID_DECISIONS = new Set<string>([
  "APPROVE_ALL", "APPROVE_TEXT_REJECT_IMAGE", "REJECT_TEXT_APPROVE_IMAGE",
  "REJECT_ALL", "SAVE_DRAFT", "CANCEL", "WRITE_TOPIC", "SKIP_TOPIC",
]);

export async function POST(req: NextRequest) {
  // 1. Validar o secret do webhook.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);

  // Sugestão de imagem: resposta (reply) a um pedido de aprovação com foto ou URL.
  if (update?.message?.reply_to_message) {
    await handleImageSuggestion(update.message);
    return NextResponse.json({ ok: true });
  }

  // Mensagem autónoma do editor (não é reply): pedido de notícia por URL ou texto.
  if (update?.message && !update.message.reply_to_message) {
    await handleEditorMessage(update.message);
    return NextResponse.json({ ok: true });
  }

  const cb = update?.callback_query;
  if (!cb) return NextResponse.json({ ok: true }); // ignora updates não-callback

  // 2. Allowlist de utilizadores (se configurada).
  const allow = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const fromId = String(cb.from?.id ?? "");
  if (allow.length > 0 && !allow.includes(fromId)) {
    await answerCallback(cb.id, "Sem autorização.");
    return NextResponse.json({ ok: true });
  }

  // 3f. Transcrição conferida pelo editor: callback_data = "<runId>:TRANSCRIPT_OK".
  // Só depois deste toque é que se extraem factos e se escreve — é aqui que ele apanha
  // apelidos trocados antes de entrarem no texto.
  if ((cb.data ?? "").endsWith(":TRANSCRIPT_OK")) {
    const runId = (cb.data as string).split(":")[0];
    const who = cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`;
    const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { state: true } });
    if (!run) {
      await answerCallback(cb.id, "Pedido não encontrado.");
    } else if (run.state !== "AWAITING_TRANSCRIPT_APPROVAL") {
      await answerCallback(cb.id, "Já tratado.");
    } else {
      await prisma.approvalRequest
        .update({ where: { pipelineRunId: runId }, data: { decision: "WRITE_TOPIC", decidedBy: who, decidedAt: new Date() } })
        .catch(() => {});
      await answerCallback(cb.id, "A escrever…");
      await enqueue("extract-facts", { pipelineRunId: runId });
    }
    return NextResponse.json({ ok: true });
  }

  // 3e. Cancelar um pedido em curso: callback_data = "X:<runId>:CANCEL".
  // Trava o processamento antes de gastar mais créditos. Só cancela o que ainda não foi
  // publicado; o que já está no site exige a via normal (não se despublica por engano).
  if ((cb.data ?? "").startsWith("X:")) {
    const [, xRunId] = (cb.data as string).split(":");
    const who = cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`;
    const run = await prisma.pipelineRun.findUnique({
      where: { id: xRunId },
      include: { candidate: { select: { title: true } }, wpDraft: { select: { status: true } } },
    });
    if (!run) {
      await answerCallback(cb.id, "Pedido não encontrado.");
    } else if (run.wpDraft?.status === "publish") {
      await answerCallback(cb.id, "Já publicado.");
      await sendText("⚠️ Esta notícia já está publicada no site. Cancelar aqui não a remove.");
    } else if (["ARCHIVED", "DONE"].includes(run.state)) {
      await answerCallback(cb.id, "Já estava cancelado.");
    } else {
      await prisma.pipelineRun.update({ where: { id: xRunId }, data: { state: "ARCHIVED", error: null } });
      await recordDecision({
        pipelineRunId: xRunId,
        agent: "ORCHESTRATOR",
        fromState: run.state,
        toState: "ARCHIVED",
        ok: true,
        output: { motivo: "cancelado pelo editor", por: who },
      }).catch(() => {});
      await answerCallback(cb.id, "Cancelado");
      await sendText(`🛑 <b>Pedido cancelado</b> por ${who}.\n«${run.candidate?.title ?? "sem título"}»\n<i>Não se gasta mais nada com esta notícia.</i>`);
    }
    return NextResponse.json({ ok: true });
  }

  // 3d. Aprovação de push notification: callback_data = "P:<runId>:SEND|SKIP".
  if ((cb.data ?? "").startsWith("P:")) {
    const [, pRunId, act] = (cb.data as string).split(":");
    const who = cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`;
    if (act === "SEND") {
      const run = await prisma.pipelineRun.findUnique({ where: { id: pRunId }, include: { article: true, wpDraft: true } });
      if (!run?.article) { await answerCallback(cb.id, "Sem artigo."); return NextResponse.json({ ok: true }); }
      await answerCallback(cb.id, "A enviar push…");
      const { title, body } = generatePush({ title: run.article.title, lead: run.article.lead, metaDescription: run.article.metaDescription });
      const results = await sendPush(title, body, run.wpDraft?.link ?? "");
      const okServices = results.filter((r) => r.ok).map((r) => r.service);
      const failed = results.filter((r) => !r.ok);
      await sendText(
        okServices.length > 0
          ? `🔔 <b>Push enviado</b> (${okServices.join(", ")}) por ${who}.${failed.length ? ` Falhou: ${failed.map((f) => `${f.service} (${f.error})`).join("; ")}` : ""}`
          : `⚠️ Push não enviado. ${failed.map((f) => `${f.service}: ${f.error}`).join("; ")}`
      );
    } else if (act === "SKIP") {
      await answerCallback(cb.id, "Push não enviado");
      await sendText(`🔕 Push: não enviado (por ${who}).`);
    } else {
      await answerCallback(cb.id, "Acção inválida.");
    }
    return NextResponse.json({ ok: true });
  }

  // 3c. Aprovação de publicação nas redes: "S:<runId>:PUB|SCHED|EDIT|SKIP[:<min>]".
  if ((cb.data ?? "").startsWith("S:")) {
    const parts = (cb.data as string).split(":");
    const sRunId = parts[1];
    const act = parts[2];
    const who = cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`;

    // Agendar: mostrar opções de tempo; depois S:runId:SCHED:<min> agenda.
    if (act === "SCHED" && !parts[3]) {
      await answerCallback(cb.id, "Escolhe quando");
      const opt = (label: string, min: number) => ({ text: label, callback_data: `S:${sRunId}:SCHED:${min}` });
      await sendMessageWithKeyboard("⏰ <b>Agendar para quando?</b>", {
        inline_keyboard: [
          [opt("+1 h", 60), opt("+3 h", 180)],
          [opt("+6 h", 360), opt("+12 h", 720)],
          [opt("Amanhã (+24 h)", 1440)],
        ],
      });
      return NextResponse.json({ ok: true });
    }
    if (act === "SCHED" && parts[3]) {
      const minutes = Math.max(11, parseInt(parts[3]) || 60); // FB exige ≥10 min
      const post = await prisma.socialPost.findFirst({ where: { pipelineRunId: sRunId, status: "DRAFT" }, include: { targets: true }, orderBy: { createdAt: "desc" } });
      if (!post || post.targets.length === 0) { await answerCallback(cb.id, "Sem post."); return NextResponse.json({ ok: true }); }
      await answerCallback(cb.id, "A agendar…");
      const whenUnix = Math.floor(Date.now() / 1000) + minutes * 60;
      const r = await scheduleSocialPost(post.id, whenUnix);
      const quando = new Date(whenUnix * 1000).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
      await sendText(r.scheduled > 0 ? `⏰ <b>Agendado no Facebook</b> para ${quando} por ${who}.` : "⚠️ Não consegui agendar. Ver logs do Social Hub.");
      return NextResponse.json({ ok: true });
    }

    // Editar a copy social: instrui a responder ao cartão com o texto novo.
    if (act === "EDIT") {
      await answerCallback(cb.id, "Responde com o texto novo");
      const mid = await sendText("✏️ Responde a ESTA mensagem (ou ao cartão) com o texto corrigido do post das redes e eu actualizo-o.");
      if (mid) await prisma.socialPost.updateMany({ where: { pipelineRunId: sRunId, status: "DRAFT" }, data: { editPromptMessageId: mid } });
      return NextResponse.json({ ok: true });
    }

    if (act === "PUB") {
      const post = await prisma.socialPost.findFirst({
        where: { pipelineRunId: sRunId, status: "DRAFT" },
        include: { targets: true },
        orderBy: { createdAt: "desc" },
      });
      if (!post || post.targets.length === 0) {
        await answerCallback(cb.id, "Sem post para publicar.");
        return NextResponse.json({ ok: true });
      }
      await answerCallback(cb.id, "A publicar nas redes…");
      await publishPostNow(post.id).catch(() => {});
      const targets = await prisma.socialPostTarget.findMany({ where: { postId: post.id } });
      const published = targets.filter((t) => t.status === "PUBLISHED").length;
      const failed = targets.filter((t) => t.status === "FAILED").length;
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: published > 0 && failed === 0 ? "PUBLISHED" : failed > 0 && published > 0 ? "PARTIAL" : failed > 0 ? "FAILED" : "DRAFT" },
      });
      await sendText(
        published > 0
          ? `📘 <b>Publicado nas redes</b> (${published} destino(s)) por ${who}.${failed ? ` ${failed} falhou.` : ""}`
          : `⚠️ Não consegui publicar nas redes.${failed ? " Ver logs do Social Hub." : ""}`
      );
    } else if (act === "SKIP") {
      await answerCallback(cb.id, "Não publicado nas redes");
      await sendText(`🔕 Redes sociais: não publicado (por ${who}).`);
    } else {
      await answerCallback(cb.id, "Acção inválida.");
    }
    return NextResponse.json({ ok: true });
  }

  // 3b. Pedido de edição do texto: instrui o editor a responder com o texto novo.
  if ((cb.data ?? "").endsWith(":EDIT_TEXT")) {
    const editRunId = (cb.data as string).slice(0, -":EDIT_TEXT".length);
    await answerCallback(cb.id, "Responde com o texto novo");
    // O editor vai naturalmente responder a ESTA mensagem (é ela que lho pede). Guardamos o
    // seu id no cartão da aprovação para que a resposta seja reconhecida — senão caía no
    // "não percebi a que notícia se refere".
    const mid = await sendText(
      "✏️ <b>Editar</b>\nResponde a esta mensagem com:\n" +
        "• o <b>texto</b> corrigido, para mudar o corpo;\n" +
        "• <code>Título: o teu título</code>, para mudar só o título;\n" +
        "• o título nessa linha e o <b>texto por baixo</b>, para mudar os dois.\n" +
        "Depois é só carregar em <b>Aprovar tudo</b>."
    );
    if (mid) {
      await prisma.approvalRequest
        .update({ where: { pipelineRunId: editRunId }, data: { cardMessageIds: { push: Number(mid) } } })
        .catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // 3. Interpretar o botão: callback_data = "<runId>:<DECISION>".
  const data: string = cb.data ?? "";
  const sep = data.lastIndexOf(":");
  const runId = data.slice(0, sep);
  const decisionStr = data.slice(sep + 1);
  if (!runId || !VALID_DECISIONS.has(decisionStr)) {
    await answerCallback(cb.id, "Acção inválida.");
    return NextResponse.json({ ok: true });
  }
  const decision = decisionStr as ApprovalDecision;

  const decidedBy = cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`;
  const result = await applyApprovalDecision(runId, decision, decidedBy, "telegram");

  await answerCallback(cb.id, result.ok ? result.label : result.error);

  if (!result.ok) return NextResponse.json({ ok: true });

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { article: true, candidate: { include: { source: { select: { name: true } } } }, wpDraft: true },
  });

  // 4. Confirmação registada no grupo — regista quem fez o quê, e sobre que peça.
  // Fica no histórico do chat (o answerCallback é só um aviso efémero para quem clicou).
  const title = run?.article?.title ?? run?.candidate?.title ?? "(sem título)";
  const when = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  await sendText(`✅ <b>${result.label}</b>\nPor ${decidedBy} · ${when}\n«${title}»`);

  // 5. Editar a mensagem original para reflectir a decisão e remover os botões (gate de
  // publicação, que tem artigo).
  if (run?.article && cb.message?.chat?.id && cb.message?.message_id) {
    const summary = formatApprovalSummary({
      title: run.article.title,
      bodyExcerpt: excerpt(run.article.body),
      sourceName: run.candidate?.source.name ?? "",
      sourceUrl: run.candidate?.url ?? "",
      wordCount: run.article.wordCount,
      category: run.article.category,
      qaWarnings: [],
      wpSimulated: run.wpDraft?.simulated ?? true,
    });
    await editMessageDecision(String(cb.message.chat.id), String(cb.message.message_id), summary, result.label ?? "");
  }

  return NextResponse.json({ ok: true });
}

const IMAGE_URL_RE = /https?:\/\/\S+\.(?:jpe?g|png|webp)(?:\?\S*)?/i;
const ANY_URL_RE = /https?:\/\/[^\s]+/i;

/**
 * Mensagem autónoma do editor (não é resposta a um pedido). Interpreta:
 *  - URL → gera notícia a partir da fonte (verifica factos, escreve já).
 *  - texto livre → gera notícia a partir do que o editor escreveu.
 * Segurança: só a allowlist; o URL/texto é dado a verificar, nunca fonte de instruções.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEditorMessage(message: any): Promise<void> {
  const allow = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(String(message.from?.id ?? ""))) return;

  const text: string = (message.text ?? message.caption ?? "").trim();
  if (!text) return;

  const who = message.from?.username ? `@${message.from.username}` : `tg:${message.from?.id ?? ""}`;

  // URL → notícia a partir da fonte.
  const urlMatch = text.match(ANY_URL_RE);
  if (urlMatch) {
    await sendText("🛠️ A ler o URL e a preparar a notícia. Recebes para aprovação quando estiver pronta.");
    const r = await intakeUrl(urlMatch[0], who);
    if (!r.ok) await sendText(`⚠️ ${r.error}`);
    else await enviarBotaoCancelar(r.runId, r.title);
    return;
  }

  // Texto livre → notícia.
  await sendText("🛠️ Recebido. A preparar a notícia a partir do teu texto.");
  const r = await intakeText(text, who);
  if (!r.ok) await sendText(`⚠️ ${r.error}`);
  else await enviarBotaoCancelar(r.runId, r.title);
}

/** Confirmação do pedido com botão para o travar antes de gastar mais créditos. */
async function enviarBotaoCancelar(runId?: string, titulo?: string): Promise<void> {
  if (!runId) return;
  await sendMessageWithKeyboard(
    `📄 <b>${titulo ?? "Notícia em preparação"}</b>\n<i>Se te enganaste ou mudaste de ideias, cancela aqui.</i>`,
    { inline_keyboard: [[{ text: "🛑 Cancelar este pedido", callback_data: `X:${runId}:CANCEL` }]] },
  );
}

/**
 * Processa uma resposta ao pedido de aprovação com uma imagem sugerida pelo editor:
 * uma foto anexada ou um URL do banco de imagens. Substitui a imagem, valida-a e
 * reenvia o pedido de aprovação com a nova imagem.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleImageSuggestion(message: any): Promise<void> {
  // Allowlist de utilizadores (se configurada).
  const allow = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(String(message.from?.id ?? ""))) return;

  const repliedId = String(message.reply_to_message?.message_id ?? "");
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  const replyText: string = (message.text ?? message.caption ?? "").trim();

  // 1. Resposta ao cartão das REDES SOCIAIS (ou à instrução de edição), sem foto → editar copy.
  const socialPost = await prisma.socialPost.findFirst({
    where: { OR: [{ telegramMessageId: repliedId }, { editPromptMessageId: repliedId }] },
    orderBy: { createdAt: "desc" },
  });
  if (socialPost && !hasPhoto) {
    if (socialPost.status !== "DRAFT") {
      await sendText("Esse post das redes já foi publicado/agendado — já não dá para editar aqui.");
      return;
    }
    if (replyText.length >= 5) await handleSocialEdit(socialPost.id, replyText);
    else await sendText("Responde com o texto novo do post das redes.");
    return;
  }

  // 2. Resposta a um pedido de aprovação — à FOTO ou ao TEXTO (o cartão com imagem são 2
  // mensagens). Foto/URL → sugestão de imagem; texto → edição do artigo.
  // Reconhece a resposta a QUALQUER cartão já enviado desta notícia (texto, foto ou reenvios
  // anteriores), não só ao último — senão responder a um cartão antigo falhava em silêncio.
  const repliedNum = Number(repliedId);
  const approval = await prisma.approvalRequest.findFirst({
    where: {
      OR: [
        { messageId: repliedId },
        { imageMessageId: repliedId },
        ...(Number.isFinite(repliedNum) ? [{ cardMessageIds: { has: repliedNum } }] : []),
      ],
    },
  });

  // 2-A. Resposta ao cartão da TRANSCRIÇÃO: é uma correcção do que a máquina ouviu mal
  // (tipicamente apelidos estrangeiros). Substitui-se a transcrição guardada antes de os
  // factos serem extraídos — é este o ponto em que o erro ainda sai barato.
  if (approval && !hasPhoto && replyText.length >= 20) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: approval.pipelineRunId },
      select: { state: true, candidate: { select: { id: true, transcript: { select: { id: true } } } } },
    });
    if (run?.state === "AWAITING_TRANSCRIPT_APPROVAL" && run.candidate?.transcript) {
      await prisma.transcript.update({
        where: { candidateId: run.candidate.id },
        data: { text: replyText },
      });
      await sendText(
        `✅ <b>Transcrição corrigida</b> (${replyText.length} caracteres).\n` +
        `<i>Carrega em «Escrever com isto» quando quiseres que eu avance.</i>`,
      );
      return;
    }
  }

  // Extrair a imagem: foto anexada ou URL no texto/legenda.
  let img: { url: string; source: "user" | "bank"; width?: number; height?: number } | null = null;
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    const url = await getFileUrl(largest.file_id);
    if (url) img = { url, source: "user", width: largest.width, height: largest.height };
  } else {
    const text: string = message.text ?? message.caption ?? "";
    const match = text.match(IMAGE_URL_RE);
    if (match) img = { url: match[0], source: "bank" };
  }

  if (!img) {
    // Edição do corpo do artigo. Alvo: a aprovação da mensagem respondida; se não bater
    // certo (respondeu a outra mensagem do cartão), mas só houver UM artigo à espera de
    // aprovação, é a esse que se refere — torna a edição tolerante ao alvo da resposta.
    // "Título: X" muda o título; com texto por baixo muda os dois; sem prefixo é só o corpo.
    const edit = parseEditReply(replyText);
    // Uma edição SÓ de título é curta por natureza, por isso o mínimo de 30 caracteres não
    // se lhe aplica (senão era ignorada em silêncio).
    const pareceEdicao = edit.title ? edit.title.length >= 5 : replyText.length >= 30;

    let targetRunId = approval?.pipelineRunId ?? null;
    if (!targetRunId && pareceEdicao) {
      const pending = await prisma.pipelineRun.findMany({ where: { state: "AWAITING_APPROVAL" }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: 2 });
      if (pending.length === 1) targetRunId = pending[0].id;
    }
    if (targetRunId && pareceEdicao) {
      await handleTextEdit(targetRunId, edit.title, edit.body);
      return;
    }
    // Não deixar falhar em silêncio: se parece uma edição mas não sei a que notícia pertence,
    // explica em vez de ignorar (ex.: respondeu a uma mensagem que não é um cartão).
    if (approval) {
      await sendText(
        "Para <b>editar o texto</b>, responde com o texto corrigido.\n" +
          "Para <b>editar o título</b>, responde com <code>Título: o teu título</code> (podes pôr o texto novo por baixo).\n" +
          "Para a <b>imagem</b>, responde com uma foto ou um URL de imagem (.jpg, .png, .webp).",
      );
    } else if (pareceEdicao) {
      await sendText("Não percebi a que notícia se refere esta edição. Responde <b>ao cartão da notícia</b> (a mensagem com os botões) com o texto corrigido.");
    }
    return;
  }

  if (!approval) return; // imagem sugerida mas não sei a que aprovação pertence
  const result = await applyImageSuggestion(approval.pipelineRunId, img);
  if (!result.ok) {
    await sendText("Não consegui aplicar a imagem. Tenta novamente.");
    return;
  }

  const note = result.qaPassed
    ? "✅ Imagem actualizada."
    : `⚠️ Imagem actualizada, mas com avisos: ${result.issues.join("; ")}`;
  await sendText(note);

  // Reenviar o pedido de aprovação com a nova imagem.
  await notifyPublishApproval(approval.pipelineRunId).catch(() => {});
}

/**
 * Edição do texto pelo editor: substitui o corpo do artigo pelo texto enviado, actualiza o
 * rascunho no WordPress (se existir) e reenvia o pedido de aprovação. O editor edita e depois
 * aprova.
 */
async function handleTextEdit(pipelineRunId: string, newTitle: string | null, newBody: string | null): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { article: true, wpDraft: true },
  });
  if (!run?.article) {
    await sendText("Não encontrei o artigo para editar.");
    return;
  }

  const data: { title?: string; body?: string; wordCount?: number; slug?: string } = {};
  if (newBody) {
    data.body = newBody;
    data.wordCount = newBody.split(/\s+/).filter(Boolean).length;
  }
  if (newTitle) {
    data.title = newTitle;
    // O post só é criado no site na publicação. Enquanto não existir, o slug acompanha o
    // título novo. Se já está publicado, o slug NÃO muda (mudaria o URL e partia os links).
    if (!run.wpDraft?.wpPostId) data.slug = toSlug(newTitle);
  }
  await prisma.article.update({ where: { pipelineRunId }, data });

  if (run.wpDraft?.wpPostId) {
    if (newBody) await updatePostContent(run.wpDraft.wpPostId, newBody).catch(() => {});
    if (newTitle) await updatePostTitle(run.wpDraft.wpPostId, newTitle).catch(() => {});
  }

  const oQue = newTitle && newBody ? "Título e texto actualizados" : newTitle ? "Título actualizado" : "Texto actualizado";
  const nota = newTitle && run.wpDraft?.wpPostId ? " (o endereço da página mantém-se, para não partir links)" : "";
  // Aviso: o texto novo veio num bloco só, mas o anterior tinha parágrafos. Quase sempre é
  // cópia que perdeu as quebras. Grava na mesma (a vontade é tua), mas dá conta do sucedido.
  const parasAntes = run.article.body.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const semParagrafos = !!newBody && !/\n\s*\n/.test(newBody) && newBody.length > 400 && parasAntes > 1;
  const avisoParas = semParagrafos
    ? `\n\n⚠️ O texto novo veio <b>todo num bloco</b> (o anterior tinha ${parasAntes} parágrafos). Se não foi de propósito, responde outra vez com uma linha em branco entre parágrafos.`
    : "";
  await sendText(`✅ ${oQue} com a tua versão${nota}. Reenvio o pedido para aprovares.${avisoParas}`);
  await notifyPublishApproval(pipelineRunId).catch(() => {});
}

/** Edição da copy das redes sociais: substitui o texto do post e reenvia o cartão social. */
async function handleSocialEdit(socialPostId: string, newText: string): Promise<void> {
  const post = await prisma.socialPost.update({
    where: { id: socialPostId },
    data: { text: newText },
    select: { pipelineRunId: true },
  });
  await sendText("✅ Copy das redes actualizada.");
  if (post.pipelineRunId) await notifySocialApproval(post.pipelineRunId).catch(() => {});
}
