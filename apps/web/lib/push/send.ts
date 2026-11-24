/**
 * Envio de push notifications via APIs oficiais (OneSignal + PushAlert). Usado só após
 * aprovação humana explícita (regra §21). Erros não lançam — devolvem-se para o cartão do
 * Telegram reportar. Ver CLAUDE.md §21.
 */

export interface PushResult {
  service: "OneSignal" | "PushAlert";
  ok: boolean;
  error?: string;
}

/** Envia via OneSignal (segmento "Subscribed Users"). */
export async function sendOneSignal(title: string, body: string, url: string): Promise<PushResult> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const key = process.env.ONESIGNAL_API_KEY;
  if (!appId || !key) return { service: "OneSignal", ok: false, error: "sem credenciais" };
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${key}` },
      body: JSON.stringify({
        app_id: appId,
        headings: { en: title, pt: title },
        contents: { en: body, pt: body },
        url,
        included_segments: ["Subscribed Users"],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errors) return { service: "OneSignal", ok: false, error: JSON.stringify(data.errors ?? data).slice(0, 200) };
    return { service: "OneSignal", ok: true };
  } catch (err) {
    return { service: "OneSignal", ok: false, error: err instanceof Error ? err.message : "erro" };
  }
}

/** Envia via PushAlert (todos os subscritores). */
export async function sendPushAlert(title: string, body: string, url: string): Promise<PushResult> {
  const key = process.env.PUSHALERT_API_KEY;
  if (!key) return { service: "PushAlert", ok: false, error: "sem credencial" };
  try {
    const res = await fetch("https://api.pushalert.co/rest/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `api_key=${key}` },
      body: new URLSearchParams({ title, message: body, url }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) return { service: "PushAlert", ok: false, error: JSON.stringify(data).slice(0, 200) };
    return { service: "PushAlert", ok: true };
  } catch (err) {
    return { service: "PushAlert", ok: false, error: err instanceof Error ? err.message : "erro" };
  }
}

/** Envia por ambos os serviços. */
export async function sendPush(title: string, body: string, url: string): Promise<PushResult[]> {
  return Promise.all([sendOneSignal(title, body, url), sendPushAlert(title, body, url)]);
}
