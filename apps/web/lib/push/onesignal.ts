export interface OneSignalNotification {
  title: string;
  body: string;
  url: string;
}

export interface OneSignalResult {
  id?: string;
  recipients?: number;
  errors?: unknown;
}

export async function sendOneSignal(
  notif: OneSignalNotification
): Promise<OneSignalResult> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId || !apiKey) {
    throw new Error("ONESIGNAL_APP_ID e ONESIGNAL_API_KEY são obrigatórios");
  }

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      included_segments: ["All"],
      headings: { pt: notif.title, en: notif.title },
      contents: { pt: notif.body, en: notif.body },
      web_url: notif.url,
    }),
  });

  const data = await res.json() as OneSignalResult;

  if (!res.ok || data.errors) {
    throw new Error(`OneSignal: ${JSON.stringify(data.errors ?? data)}`);
  }

  return data;
}
