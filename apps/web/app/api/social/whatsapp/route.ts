import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GRAPH = "https://graph.facebook.com/v21.0";
// Canal: https://whatsapp.com/channel/0029Va8HmfBFcowET2jT6G1q
const CHANNEL_ID = "0029Va8HmfBFcowET2jT6G1q";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    return NextResponse.json(
      { error: "WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN não estão configurados no .env" },
      { status: 503 }
    );
  }

  const { message, newsItemId } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Mensagem em falta" }, { status: 400 });
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `newsletter/${CHANNEL_ID}`,
      type: "text",
      text: { body: message },
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data.error?.message ?? "Erro ao publicar no WhatsApp";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await prisma.log.create({
    data: {
      action: "whatsapp_channel_post",
      details: `Publicado no canal WhatsApp${newsItemId ? ` | notícia ${newsItemId}` : ""}`,
      userId: session.user?.id,
    },
  });

  return NextResponse.json({ ok: true, messageId: data.messages?.[0]?.id });
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const configured = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  return NextResponse.json({ configured });
}
