import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const items = await prisma.newsItem.findMany({
    where: {
      status: "texto_gerado",
      generatedTexts: { some: {} },
    },
    orderBy: { createdAt: "desc" },
    include: {
      source: { select: { name: true } },
      generatedTexts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { newsItemId, action } = await req.json();

  if (!newsItemId || !["ignorar", "guardar"].includes(action)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  if (action === "ignorar") {
    const item = await prisma.newsItem.findUnique({
      where: { id: newsItemId },
      select: { title: true, url: true },
    });

    if (item?.url) {
      await prisma.ignoredUrl.upsert({
        where: { url: item.url },
        update: {},
        create: { url: item.url },
      });
    }

    await prisma.generatedText.deleteMany({ where: { newsItemId } });
    await prisma.newsItem.delete({ where: { id: newsItemId } });

    await prisma.log.create({
      data: {
        action: "aprovacao_rejeitada",
        details: `Notícia apagada após rejeição: "${item?.title ?? newsItemId}"`,
        userId: session.user?.id,
      },
    });

    return NextResponse.json({ ok: true, deleted: true });
  }

  await prisma.newsItem.update({
    where: { id: newsItemId },
    data: { status: "guardada" },
  });

  await prisma.log.create({
    data: {
      action: "aprovacao_aceite",
      details: `Notícia ${newsItemId} aprovada para editor`,
      userId: session.user?.id,
    },
  });

  return NextResponse.json({ ok: true, status: "guardada" });
}
