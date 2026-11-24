import { prisma } from "@/lib/prisma";
import { sendApprovalMessage, sendMessageWithKeyboard, buildTopicKeyboard, buildTranscriptKeyboard, sendText, type SendResult } from "../telegram/client";
import { formatApprovalSummary, excerpt } from "../telegram/format";
import { generatePush } from "../push/generate";
import { isOfficialBenficaSource } from "../dedup/decide";
import { runCostBreakdown, estimateArticleCostBreakdown, formatEur } from "../costs";
import { explicarParagem, formatarParagem } from "./stop-reason";

/**
 * Guarda TODOS os ids de mensagens de cartão de um pedido (texto + foto), acumulando os de
 * reenvios anteriores. Assim uma resposta a QUALQUER cartão (mesmo antigo) é reconhecida —
 * senão só o último reenvio funcionava e o editor ficava sem saber porque "não aplicava".
 */
async function recordCardIds(pipelineRunId: string, result: SendResult): Promise<void> {
  const ids = [result.messageId, result.imageMessageId]
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (ids.length === 0) return;
  await prisma.approvalRequest.update({
    where: { pipelineRunId },
    data: { cardMessageIds: { push: ids } },
  }).catch(() => {});
}

/**
 * Pede aprovação humana para PUBLICAR nas redes sociais (Facebook), depois de a notícia já
 * estar publicada no site. Mostra a copy exacta que vai ser publicada. Nada é publicado em
 * redes sem esta aprovação (regra §20). Botões: publicar / não publicar.
 */
export async function notifySocialApproval(pipelineRunId: string): Promise<void> {
  const post = await prisma.socialPost.findFirst({
    where: { pipelineRunId, status: "DRAFT" },
    include: { targets: { include: { account: { select: { platform: true, accountName: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  if (!post || post.targets.length === 0) return;

  const contas = Array.from(new Set(post.targets.map((t) => `${t.account.platform} (${t.account.accountName})`)));
  const text =
    `📢 <b>Publicar nas redes?</b>\n` +
    `Destinos: ${contas.join(", ")}\n\n` +
    `${post.text}\n\n` +
    `<i>Só publico nas redes se aprovares. Para editar, responde a esta mensagem com o texto novo.</i>`;

  const result = await sendMessageWithKeyboard(text, {
    inline_keyboard: [
      [{ text: "📘 Publicar agora", callback_data: `S:${pipelineRunId}:PUB` }],
      [{ text: "⏰ Agendar publicação", callback_data: `S:${pipelineRunId}:SCHED` }],
      [{ text: "✏️ Editar texto", callback_data: `S:${pipelineRunId}:EDIT` }],
      [{ text: "🔕 Não publicar", callback_data: `S:${pipelineRunId}:SKIP` }],
    ],
  });

  // Guarda o id da mensagem para permitir editar a copy por resposta.
  if (result.messageId) {
    await prisma.socialPost.update({ where: { id: post.id }, data: { telegramMessageId: result.messageId } }).catch(() => {});
  }
}

/**
 * Pede aprovação humana para ENVIAR a push notification (OneSignal + PushAlert), depois de a
 * notícia estar publicada. Nada é enviado sem esta aprovação (regra §21). Mostra o conteúdo.
 */
export async function notifyPushApproval(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { article: true, wpDraft: true },
  });
  if (!run?.article) return;
  const { title, body } = generatePush({
    title: run.article.title,
    lead: run.article.lead,
    metaDescription: run.article.metaDescription,
  });
  const text =
    `🔔 <b>Enviar push notification?</b>\n(OneSignal + PushAlert)\n\n` +
    `<b>${title}</b>\n${body}\n\n` +
    `<i>Só envio o push se aprovares.</i>`;

  await sendMessageWithKeyboard(text, {
    inline_keyboard: [[
      { text: "🔔 Enviar push", callback_data: `P:${pipelineRunId}:SEND` },
      { text: "Não enviar", callback_data: `P:${pipelineRunId}:SKIP` },
    ]],
  });
}

/**
 * Avisa no Telegram quando um run FALHA, para nada morrer em silêncio. Antes só avisava os
 * pedidos do editor (origem "editor"); agora avisa também a recolha do site OFICIAL do Benfica
 * (fonte primária), que é o caso que estava a perder-se: anúncios curtos do clube esgotavam a
 * reescrita e ficavam em FAILED sem chegar à aprovação. Fontes de terceiros continuam a falhar
 * em silêncio (não são para publicar tal e qual, e encheriam o chat).
 */
export async function notifyEditorFailure(pipelineRunId: string): Promise<void> {
  return notifyRunStopped(pipelineRunId);
}

/**
 * Avisa o editor quando um run morre antes de chegar a texto, dizendo PORQUÊ.
 *
 * Vale para os dois fins de linha: FAILED (avaria, limite de reescritas) e ARCHIVED (o
 * sistema decidiu não avançar — duplicado, triagem, factos insuficientes). Antes só existia
 * aviso para FAILED, e mesmo esse só para pedidos do editor e para o site oficial: uma
 * notícia do Record que o editor mandou escrever morria em silêncio absoluto.
 *
 * Só avisa quando alguém está à espera de resposta: o editor carregou em "escrever", pediu
 * por texto, ou é do site oficial (que escreve sem passar pelo gate). Não avisa da triagem
 * automática, senão eram dezenas de mensagens por dia.
 */
const MANDOU_ESCREVER = new Set([
  "WRITE_TOPIC",
  "APPROVE_ALL",
  "APPROVE_TEXT_REJECT_IMAGE",
  "REJECT_TEXT_APPROVE_IMAGE",
]);

export async function notifyRunStopped(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      candidate: { select: { origin: true, title: true, url: true, source: { select: { url: true } } } },
      approval: { select: { decision: true } },
      decisions: { orderBy: { createdAt: "desc" }, take: 1, select: { agent: true, toState: true, output: true } },
    },
  });
  if (!run?.candidate) return;

  const c = run.candidate;
  const official = isOfficialBenficaSource(c.url) || isOfficialBenficaSource(c.source?.url ?? "");
  const ultimo = run.decisions[0];

  // Se foi o editor a mandar parar, ele já sabe porque parou. Avisá-lo seria devolver-lhe a
  // própria decisão como se fosse notícia — e são a esmagadora maioria dos runs arquivados.
  if (ultimo?.agent === "TELEGRAM_APPROVAL") return;

  // Só se avisa quem está à espera de um texto: o editor mandou escrever, ou pediu por
  // mensagem. A fonte oficial só é avisada quando REBENTA (FAILED); um arquivo de rotina
  // (duplicado, triagem) não é notícia para ninguém.
  const mandouEscrever = MANDOU_ESCREVER.has(run.approval?.decision ?? "");
  const pedidoDoEditor = c.origin === "editor" || mandouEscrever;
  if (!pedidoDoEditor && !(official && run.state === "FAILED")) return;

  // Não repetir o aviso se este run já foi explicado (reentradas, retries do BullMQ).
  const meta = (run.meta as Record<string, unknown> | null) ?? {};
  if (meta.avisoParagemEnviado) return;

  const paragem = explicarParagem({
    agent: ultimo?.agent ?? run.currentAgent ?? "desconhecido",
    toState: ultimo?.toState ?? run.state,
    output: (ultimo?.output as Record<string, unknown> | null) ?? null,
    error: run.error,
    sourceUrl: c.url,
  });

  await sendText(formatarParagem(c.title, paragem));
  await prisma.pipelineRun
    .update({ where: { id: pipelineRunId }, data: { meta: { ...meta, avisoParagemEnviado: true } } })
    .catch(() => {});
}

/**
 * Cartão da transcrição: mostra ao editor o que a conferência disse, ANTES de se escrever.
 *
 * É aqui que se apanham apelidos estrangeiros trocados, que era o ponto mais frágil desta
 * funcionalidade. Para corrigir, o editor responde ao cartão com o texto certo, como já faz
 * nos outros cartões.
 */
export async function notifyTranscriptApproval(pipelineRunId: string): Promise<SendResult> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { candidate: { select: { title: true, transcript: true } } },
  });
  const t = run?.candidate?.transcript;
  if (!t) throw new Error("Cartão de transcrição sem transcrição");

  const minutos = Math.round(t.durationSec / 60);
  const texto =
    `🎙️ <b>Conferência transcrita</b>\n` +
    `«${run!.candidate!.title}»\n` +
    `${minutos} min de áudio · ${t.text.length} caracteres · 💰 ${formatEur(t.costEur)} €\n\n` +
    `${excerpt(t.text, 2500)}\n\n` +
    `<i>Confere os nomes antes de eu escrever. Se algo estiver trocado, responde a esta mensagem com a correcção.</i>`;

  const result = await sendMessageWithKeyboard(texto, buildTranscriptKeyboard(pipelineRunId));

  await prisma.approvalRequest.upsert({
    where: { pipelineRunId },
    update: {
      channel: result.simulated ? "simulado" : "telegram",
      chatId: result.chatId,
      messageId: result.messageId,
      decision: null,
      decidedBy: null,
      decidedAt: null,
    },
    create: {
      pipelineRunId,
      channel: result.simulated ? "simulado" : "telegram",
      chatId: result.chatId,
      messageId: result.messageId,
    },
  });
  await recordCardIds(pipelineRunId, result);

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { state: "AWAITING_TRANSCRIPT_APPROVAL" },
  });
  return result;
}

/**
 * Monta e envia o pedido de aprovação de publicação (com imagem, se existir) e
 * (re)grava o ApprovalRequest. Reutilizado pelo agente telegram-approval e pelo webhook
 * (quando a imagem é substituída por sugestão do editor). NÃO transiciona estado.
 */
export async function notifyPublishApproval(pipelineRunId: string): Promise<SendResult> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      article: true,
      candidate: { include: { source: { select: { name: true } } } },
      qaReports: true,
      wpDraft: true,
      image: true,
    },
  });
  if (!run?.article) throw new Error("Aprovação sem artigo");

  const qaWarnings: string[] = [];
  for (const q of run.qaReports) {
    const issues = Array.isArray(q.issues) ? (q.issues as { severity: string; detail: string }[]) : [];
    for (const iss of issues) {
      if (iss.severity === "critical" || iss.severity === "warning") qaWarnings.push(iss.detail);
    }
  }

  // O post só é criado no site quando aprovas. "simulado" reflecte o modo (não um rascunho já feito).
  const wpModeSetting = await prisma.setting.findUnique({ where: { key: "pipeline_wp_mode" } });
  const wpSimulated = wpModeSetting?.value !== "real";

  // Custo de API já gasto nesta notícia (soma dos passos com tokens registados).
  const custo = await runCostBreakdown(prisma, pipelineRunId).catch(() => ({ steps: [], total: 0 }));

  const summary = formatApprovalSummary({
    title: run.article.title,
    bodyExcerpt: excerpt(run.article.body, 3200), // texto (quase) completo no Telegram
    sourceName: run.candidate?.source.name ?? "desconhecida",
    sourceUrl: run.candidate?.url ?? "",
    wordCount: run.article.wordCount,
    category: run.article.category,
    qaWarnings,
    wpSimulated,
    costEur: custo.total,
    costSteps: custo.steps.map((s) => ({ label: s.label, calls: s.calls, eur: s.eur })),
  });

  const result = await sendApprovalMessage(summary, pipelineRunId, !!run.image, run.image?.url ?? null);

  await prisma.approvalRequest.upsert({
    where: { pipelineRunId },
    update: {
      channel: result.simulated ? "simulado" : "telegram",
      chatId: result.chatId,
      messageId: result.messageId,
      imageMessageId: result.imageMessageId ?? null,
      decision: null,
      decidedBy: null,
      decidedAt: null,
    },
    create: {
      pipelineRunId,
      channel: result.simulated ? "simulado" : "telegram",
      chatId: result.chatId,
      messageId: result.messageId,
      imageMessageId: result.imageMessageId ?? null,
    },
  });

  await recordCardIds(pipelineRunId, result);
  return result;
}

/** Envia (ou reenvia) o pedido do gate de pré-escrita (fora do Benfica). */
export async function notifyTopicApproval(pipelineRunId: string): Promise<SendResult> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { candidate: { include: { source: { select: { name: true } } } } },
  });
  if (!run?.candidate) throw new Error("Topic approval sem candidato");

  const summary = (run.candidate.summary ?? "").trim();
  const excerpt = summary.length > 220 ? `${summary.slice(0, 220)}…` : summary;

  // Estimativa do custo de API, a partir da média real das últimas notícias escritas.
  const estimativa = await estimateArticleCostBreakdown(prisma).catch(() => null);
  const linhaCusto =
    estimativa === null
      ? ""
      : `\n💰 Custo estimado: <b>${formatEur(estimativa.total)} €</b>` +
        estimativa.steps
          .filter((s) => s.eur > 0)
          .map((s) => `\n<i>   ${s.label}: ${formatEur(s.eur)} €</i>`)
          .join("");

  const text =
    `🗂️ <b>Escrever esta notícia?</b>\n\n` +
    `<b>${run.candidate.title}</b>\n` +
    `Fonte: ${run.candidate.source.name}` +
    linhaCusto +
    (excerpt ? `\n\n${excerpt}\n` : "\n") +
    `\n<i>Só extraio factos e escrevo (gastando créditos) se aprovares.</i>`;

  const result = await sendMessageWithKeyboard(text, buildTopicKeyboard(pipelineRunId));

  await prisma.approvalRequest.upsert({
    where: { pipelineRunId },
    update: { channel: result.simulated ? "simulado" : "telegram", chatId: result.chatId, messageId: result.messageId, decision: null, decidedBy: null, decidedAt: null },
    create: { pipelineRunId, channel: result.simulated ? "simulado" : "telegram", chatId: result.chatId, messageId: result.messageId },
  });
  await recordCardIds(pipelineRunId, result);
  return result;
}

/**
 * Auto-reparação: reenvia pedidos de aprovação que ficaram sem mensagem no Telegram
 * (envio falhou por rede). Chamado periodicamente pelo worker. Evita que um run fique
 * preso em silêncio à espera de uma decisão que o humano nunca chega a ver.
 */
export async function resendMissingApprovals(): Promise<number> {
  const stuck = await prisma.pipelineRun.findMany({
    where: {
      state: { in: ["AWAITING_APPROVAL", "AWAITING_TOPIC_APPROVAL"] },
      approval: { channel: "telegram", messageId: null, decidedAt: null },
    },
    select: { id: true, state: true },
    take: 20,
  });
  let resent = 0;
  for (const run of stuck) {
    try {
      const res = run.state === "AWAITING_TOPIC_APPROVAL"
        ? await notifyTopicApproval(run.id)
        : await notifyPublishApproval(run.id);
      if (res.sent) resent++;
    } catch {
      /* tenta no próximo ciclo */
    }
  }
  return resent;
}
