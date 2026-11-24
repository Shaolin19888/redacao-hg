import type { ApprovalDecision } from "@prisma/client";
import { DECISION_LABELS } from "../approval/decision";

/**
 * Cliente Telegram por HTTP directo (sem SDK). Envia pedidos de aprovação com botões
 * inline e responde a callbacks. Modo simulado quando não há TELEGRAM_BOT_TOKEN:
 * não envia nada real, permitindo testar a máquina e aprovar pelo painel.
 */

const API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN não configurado");
  return t;
}

/** Conjunto de botões a mostrar. Sem imagem, as opções de imagem são omitidas. */
export function buildKeyboard(runId: string, hasImage: boolean) {
  const btn = (decision: ApprovalDecision) => ({
    text: DECISION_LABELS[decision],
    callback_data: `${runId}:${decision}`,
  });

  const rows: { text: string; callback_data: string }[][] = [
    [btn("APPROVE_ALL")],
    [{ text: "✏️ Editar texto", callback_data: `${runId}:EDIT_TEXT` }],
  ];
  if (hasImage) {
    rows.push([btn("APPROVE_TEXT_REJECT_IMAGE")]);
  }
  rows.push([btn("REJECT_TEXT_APPROVE_IMAGE")]);
  rows.push([btn("SAVE_DRAFT"), btn("REJECT_ALL")]);
  rows.push([btn("CANCEL")]);
  return { inline_keyboard: rows };
}

/** Teclado do gate de pré-escrita (fora do Benfica): escrever ou ignorar. */
export function buildTopicKeyboard(runId: string) {
  return {
    inline_keyboard: [[
      { text: DECISION_LABELS.WRITE_TOPIC, callback_data: `${runId}:WRITE_TOPIC` },
      { text: DECISION_LABELS.SKIP_TOPIC, callback_data: `${runId}:SKIP_TOPIC` },
    ]],
  };
}

/**
 * Teclado do cartão da transcrição: seguir em frente ou desistir.
 * A transcrição erra em apelidos estrangeiros; este é o ponto onde isso se apanha antes de
 * entrar no texto. Para corrigir, o editor responde ao cartão com a versão certa.
 */
export function buildTranscriptKeyboard(runId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Escrever com isto", callback_data: `${runId}:TRANSCRIPT_OK` },
      { text: "🚫 Deixar cair", callback_data: `${runId}:SKIP_TOPIC` },
    ]],
  };
}

/** Envia uma mensagem simples com um teclado inline arbitrário. */
export async function sendMessageWithKeyboard(text: string, keyboard: object): Promise<SendResult> {
  if (!telegramConfigured()) return { sent: false, simulated: true, chatId: null, messageId: null };
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  try {
    const res = await fetch(`${API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard }),
    });
    const data = await res.json();
    if (!data.ok) return { sent: false, simulated: false, chatId, messageId: null, error: data.description };
    return { sent: true, simulated: false, chatId, messageId: String(data.result.message_id) };
  } catch (err) {
    return { sent: false, simulated: false, chatId, messageId: null, error: err instanceof Error ? err.message : "erro" };
  }
}

export interface SendResult {
  sent: boolean;
  simulated: boolean;
  chatId: string | null;
  messageId: string | null;
  imageMessageId?: string | null; // id da mensagem da foto (quando o cartão tem imagem)
  error?: string;
}

/** Envia a mensagem de aprovação com os botões. Simulado se não configurado. */
export async function sendApprovalMessage(text: string, runId: string, hasImage: boolean, imageUrl?: string | null): Promise<SendResult> {
  if (!telegramConfigured()) {
    return { sent: false, simulated: true, chatId: null, messageId: null };
  }
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const keyboard = buildKeyboard(runId, hasImage);
  try {
    // Com imagem: envia a foto PRIMEIRO como mensagem separada (a legenda do Telegram só
    // aguenta 1024 chars e cortaria o artigo). O texto completo vai a seguir, com os botões.
    // Guardamos o id da foto para aceitar respostas (sugestão de imagem) a QUALQUER das duas.
    let imageMessageId: string | null = null;
    if (imageUrl) {
      const photoRes = await fetch(`${API}/bot${token()}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, photo: imageUrl }),
      }).catch(() => null);
      const photoData = photoRes ? await photoRes.json().catch(() => null) : null;
      if (photoData?.ok) imageMessageId = String(photoData.result.message_id);
    }
    const res = await fetch(`${API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard }),
    });
    const data = await res.json();
    if (!data.ok) return { sent: false, simulated: false, chatId, messageId: null, error: data.description ?? "Erro Telegram" };
    return { sent: true, simulated: false, chatId, messageId: String(data.result.message_id), imageMessageId };
  } catch (err) {
    return { sent: false, simulated: false, chatId, messageId: null, error: err instanceof Error ? err.message : "Erro de ligação" };
  }
}

/** Responde a um callback_query (remove o "a carregar" do botão). */
export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  if (!telegramConfigured()) return;
  await fetch(`${API}/bot${token()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) }),
  }).catch(() => {});
}

/** Edita a mensagem original para reflectir a decisão tomada e remover os botões. */
export async function editMessageDecision(chatId: string, messageId: string, summary: string, decisionLabel: string): Promise<void> {
  if (!telegramConfigured()) return;
  await fetch(`${API}/bot${token()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: Number(messageId),
      text: `${summary}\n\n<b>Decisão:</b> ${decisionLabel}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

/** Obtém o URL de download de um ficheiro (foto) do Telegram a partir do file_id. */
export async function getFileUrl(fileId: string): Promise<string | null> {
  if (!telegramConfigured()) return null;
  const res = await fetch(`${API}/bot${token()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `${API}/file/bot${token()}/${data.result.file_path}`;
}

/** Envia uma mensagem de texto simples (confirmações). */
export async function sendText(text: string): Promise<string | null> {
  if (!telegramConfigured()) return null;
  try {
    const res = await fetch(`${API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => null);
    return data?.ok ? String(data.result.message_id) : null;
  } catch {
    return null;
  }
}

/**
 * Envia o relatório semanal para o chat de relatório: TELEGRAM_REPORT_CHAT_ID se existir,
 * senão o mesmo TELEGRAM_CHAT_ID das aprovações. Só envia este texto agregado, não decide
 * nada (regra de segurança da spec do relatório). Devolve o estado do envio.
 */
export async function sendReportMessage(
  text: string,
): Promise<{ sent: boolean; simulated: boolean; chatId: string | null; error?: string }> {
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || null;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    return { sent: false, simulated: true, chatId };
  }
  try {
    const res = await fetch(`${API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return { sent: false, simulated: false, chatId, error: data?.description ?? "Erro Telegram" };
    return { sent: true, simulated: false, chatId };
  } catch (err) {
    return { sent: false, simulated: false, chatId, error: err instanceof Error ? err.message : "erro" };
  }
}

/** Regista o webhook no Telegram com o segredo. Usado pelo endpoint de setup. */
export async function setWebhook(url: string, secret: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API}/bot${token()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["callback_query"] }),
  });
  const data = await res.json();
  return { ok: !!data.ok, error: data.description };
}
