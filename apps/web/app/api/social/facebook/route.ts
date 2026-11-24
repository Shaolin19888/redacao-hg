import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!pageId || !token) {
    return NextResponse.json(
      { error: "FACEBOOK_PAGE_ID e FACEBOOK_ACCESS_TOKEN não estão configurados no .env" },
      { status: 503 }
    );
  }

  const { message, link, newsItemId } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Mensagem em falta" }, { status: 400 });
  }

  const body: Record<string, string> = {
    message,
    access_token: token,
  };
  if (link) body.link = link;

  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data.error?.message ?? "Erro ao publicar no Facebook";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await prisma.log.create({
    data: {
      action: "facebook_post",
      details: `Publicado no Facebook: post ID ${data.id}${newsItemId ? ` | notícia ${newsItemId}` : ""}`,
      userId: session.user?.id,
    },
  });

  if (newsItemId) {
    await prisma.newsItem.update({
      where: { id: newsItemId },
      data: { status: "publicada" },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, postId: data.id });
}

// Verifica se as credenciais estão configuradas
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const configured = !!(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_ACCESS_TOKEN);
  return NextResponse.json({ configured });
}
