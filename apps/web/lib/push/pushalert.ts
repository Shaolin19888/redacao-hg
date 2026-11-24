export interface PushAlertNotification {
  title: string;
  message: string;
  url: string;
  image?: string;
}

export interface PushAlertResult {
  success: boolean;
  raw?: string;
}

export async function sendPushAlert(
  notif: PushAlertNotification
): Promise<PushAlertResult> {
  const apiKey = process.env.PUSHALERT_API_KEY;

  if (!apiKey) {
    throw new Error("PUSHALERT_API_KEY é obrigatória");
  }

  const params = new URLSearchParams({
    title: notif.title,
    message: notif.message,
    notification_url: notif.url,
    ...(notif.image ? { icon: notif.image } : {}),
  });

  const res = await fetch("https://pushalert.co/rest/v1/send", {
    method: "POST",
    headers: {
      Authorization: `api_key=${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await res.text();

  // PushAlert pode devolver JSON ou texto simples
  try {
    const json = JSON.parse(raw) as { success?: boolean; error?: string };
    if (json.error) throw new Error(`PushAlert: ${json.error}`);
    return { success: true, raw };
  } catch {
    // Se não for JSON, verificar se contém indicação de sucesso
    if (raw.toLowerCase().includes("success") || res.ok) {
      return { success: true, raw };
    }
    throw new Error(`PushAlert resposta inesperada: ${raw.slice(0, 200)}`);
  }
}
