import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;

  const items = await prisma.newsItem.findMany({
    where: {
      status: { in: ["texto_gerado", "guardada", "rascunho_wp", "publicada"] },
      generatedTexts: { some: {} },
      ...(search
        ? { title: { contains: search, mode: "insensitive" } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      source: { select: { name: true } },
      generatedTexts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { conteudo: true, modelo: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ items });
}
