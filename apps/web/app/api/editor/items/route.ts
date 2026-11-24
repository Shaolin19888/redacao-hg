import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const newsItems = await prisma.newsItem.findMany({
    where: { status: { in: ["aprovada", "texto_gerado"] } },
    orderBy: { fetchedAt: "desc" },
    take: 100,
    include: {
      source: { select: { name: true } },
      generatedTexts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(newsItems);
}
