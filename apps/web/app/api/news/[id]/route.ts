import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const item = await prisma.newsItem.update({
    where: { id },
    data: { status: body.status },
    select: { id: true, url: true, status: true },
  });

  // Quando aprovada, guarda o URL para não voltar a aparecer noutras fontes
  if (body.status === "aprovada" && item.url) {
    await prisma.ignoredUrl.upsert({
      where: { url: item.url },
      update: {},
      create: { url: item.url },
    });
  }

  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    const item = await prisma.newsItem.findUnique({ where: { id }, select: { url: true } });
    if (!item) return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });

    // Guardar URL para ignorar em futuras recolhas
    if (item.url) {
      await prisma.ignoredUrl.upsert({
        where: { url: item.url },
        update: {},
        create: { url: item.url },
      });
    }

    await prisma.generatedText.deleteMany({ where: { newsItemId: id } });
    await prisma.newsItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao apagar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
