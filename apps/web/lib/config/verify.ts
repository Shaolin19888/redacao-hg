/**
 * Verificação real de credenciais introduzidas no painel. Quando o editor mete um código,
 * não basta guardá-lo: testa-se contra o serviço e diz-se se ficou bom ou porque falhou.
 *
 * Cada verificador devolve { ok, message }. A mensagem é para ser lida por uma pessoa:
 * em caso de sucesso diz O QUE encontrou ("ligado a hugogil.pt"), em caso de falha diz PORQUÊ.
 */

export interface VerifyResult {
  ok: boolean;
  message: string;
}

/** Timeout curto: o painel não pode ficar pendurado à espera de um serviço lento. */
async function fetchJson(url: string, init: RequestInit = {}, ms = 8000): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function erro(e: unknown): string {
  if (e instanceof Error && e.name === "AbortError") return "o serviço não respondeu a tempo";
  return e instanceof Error ? e.message : "erro de ligação";
}

/** WordPress: liga ao site com as credenciais dadas e devolve o nome do site. */
export async function verifyWordPress(url: string, user: string, appPassword: string): Promise<VerifyResult> {
  if (!url || !user || !appPassword) return { ok: false, message: "Faltam o endereço, o utilizador ou a palavra-passe." };
  try {
    const base = url.replace(/\/$/, "");
    const token = Buffer.from(`${user}:${appPassword}`).toString("base64");
    const { status, data } = await fetchJson(`${base}/wp-json/wp/v2/users/me?_fields=name,slug`, {
      headers: { Authorization: `Basic ${token}` },
    });
    if (status === 401 || status === 403) return { ok: false, message: "Utilizador ou palavra-passe de aplicação inválidos." };
    if (status === 404) return { ok: false, message: "A API do WordPress não respondeu nesse endereço." };
    if (status >= 400) return { ok: false, message: `O WordPress respondeu ${status}.` };
    const nome = (data as { name?: string })?.name;
    return { ok: true, message: `Ligado ao WordPress como ${nome ?? user}.` };
  } catch (e) {
    return { ok: false, message: `Não consegui ligar: ${erro(e)}.` };
  }
}

/** Telegram: confirma o token e devolve o nome do bot. */
export async function verifyTelegramBot(token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, message: "Token vazio." };
  try {
    const { data } = await fetchJson(`https://api.telegram.org/bot${token}/getMe`);
    const d = data as { ok?: boolean; result?: { username?: string }; description?: string };
    if (!d?.ok) return { ok: false, message: `Token recusado pelo Telegram: ${d?.description ?? "inválido"}.` };
    return { ok: true, message: `Bot @${d.result?.username ?? "?"} confirmado.` };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com o Telegram: ${erro(e)}.` };
  }
}

/** Telegram: confirma que o bot consegue mesmo escrever no chat indicado. */
export async function verifyTelegramChat(token: string, chatId: string): Promise<VerifyResult> {
  if (!token) return { ok: false, message: "Configura primeiro o token do bot." };
  if (!chatId) return { ok: false, message: "Chat vazio." };
  try {
    const { data } = await fetchJson(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`);
    const d = data as { ok?: boolean; result?: { title?: string; username?: string }; description?: string };
    if (!d?.ok) return { ok: false, message: `O bot não acede a esse chat: ${d?.description ?? "não encontrado"}.` };
    const nome = d.result?.title ?? d.result?.username ?? chatId;
    return { ok: true, message: `Chat encontrado: ${nome}.` };
  } catch (e) {
    return { ok: false, message: `Não consegui verificar o chat: ${erro(e)}.` };
  }
}

/** Facebook: valida o token e devolve o nome da página. */
export async function verifyFacebook(pageId: string, token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, message: "Token vazio." };
  try {
    const alvo = pageId || "me";
    const { status, data } = await fetchJson(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(alvo)}?fields=id,name&access_token=${encodeURIComponent(token)}`,
    );
    const d = data as { name?: string; id?: string; error?: { message?: string } };
    if (d?.error) return { ok: false, message: `O Facebook recusou: ${d.error.message ?? "token inválido"}.` };
    if (status >= 400) return { ok: false, message: `O Facebook respondeu ${status}.` };
    return { ok: true, message: `Ligado à página ${d.name ?? d.id}.` };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com o Facebook: ${erro(e)}.` };
  }
}

/** OpenAI: confirma a chave listando os modelos (chamada barata). */
export async function verifyOpenAi(key: string): Promise<VerifyResult> {
  if (!key) return { ok: false, message: "Chave vazia." };
  try {
    const { status, data } = await fetchJson("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (status === 401) return { ok: false, message: "Chave da OpenAI inválida." };
    if (status >= 400) {
      const m = (data as { error?: { message?: string } })?.error?.message;
      return { ok: false, message: `A OpenAI respondeu ${status}${m ? `: ${m}` : ""}.` };
    }
    return { ok: true, message: "Chave da OpenAI válida." };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com a OpenAI: ${erro(e)}.` };
  }
}

/** Anthropic: confirma a chave listando os modelos. */
export async function verifyAnthropic(key: string): Promise<VerifyResult> {
  if (!key) return { ok: false, message: "Chave vazia." };
  try {
    const { status, data } = await fetchJson("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (status === 401) return { ok: false, message: "Chave da Anthropic inválida." };
    if (status >= 400) {
      const m = (data as { error?: { message?: string } })?.error?.message;
      return { ok: false, message: `A Anthropic respondeu ${status}${m ? `: ${m}` : ""}.` };
    }
    return { ok: true, message: "Chave da Anthropic válida." };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com a Anthropic: ${erro(e)}.` };
  }
}

/** OneSignal: confirma a app e a chave. */
export async function verifyOneSignal(appId: string, apiKey: string): Promise<VerifyResult> {
  if (!appId || !apiKey) return { ok: false, message: "Faltam o App ID ou a chave." };
  try {
    const { status, data } = await fetchJson(`https://api.onesignal.com/apps/${encodeURIComponent(appId)}`, {
      headers: { Authorization: `Basic ${apiKey}` },
    });
    if (status === 401 || status === 403) return { ok: false, message: "Chave da OneSignal recusada." };
    if (status === 404) return { ok: false, message: "App ID da OneSignal não encontrado." };
    if (status >= 400) return { ok: false, message: `A OneSignal respondeu ${status}.` };
    const nome = (data as { name?: string })?.name;
    return { ok: true, message: `Ligado à app ${nome ?? appId}.` };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com a OneSignal: ${erro(e)}.` };
  }
}

/** PushAlert: a API só aceita pedidos autenticados; um 401 distingue chave má de chave boa. */
export async function verifyPushAlert(apiKey: string): Promise<VerifyResult> {
  if (!apiKey) return { ok: false, message: "Chave vazia." };
  try {
    const { status } = await fetchJson("https://api.pushalert.co/rest/v1/subscribers/count", {
      headers: { Authorization: `api_key=${apiKey}` },
    });
    if (status === 401 || status === 403) return { ok: false, message: "Chave da PushAlert recusada." };
    if (status >= 400) return { ok: false, message: `A PushAlert respondeu ${status}.` };
    return { ok: true, message: "Chave da PushAlert válida." };
  } catch (e) {
    return { ok: false, message: `Não consegui falar com a PushAlert: ${erro(e)}.` };
  }
}
