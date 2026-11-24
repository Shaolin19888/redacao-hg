import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { telegramConfigured, setWebhook } from "@/lib/pipeline/telegram/client";

/**
 * Regista o webhook do Telegram apontando para este servidor (ngrok/VPS).
 * Autenticado (painel). Usa NEXTAUTH_URL/APP_PUBLIC_URL como base pública.
 */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!telegramConfigured()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados." }, { status: 400 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET não configurado." }, { status: 400 });
  }

  const base = (process.env.APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) {
    return NextResponse.json({ error: "URL público HTTPS em falta (APP_PUBLIC_URL). O Telegram exige HTTPS." }, { status: 400 });
  }

  const result = await setWebhook(`${base}/api/telegram/webhook`, secret);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Falha ao registar webhook." }, { status: 400 });

  return NextResponse.json({ ok: true, webhook: `${base}/api/telegram/webhook` });
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ configured: telegramConfigured() });
}
