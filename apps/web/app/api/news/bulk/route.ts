import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Aprovar ou rejeitar várias notícias de uma vez.
 * Body: { ids: string[], action: "approve" | "reject" }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const action: string = body.action;

  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma notícia seleccionada." }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Acção inválida." }, { status: 400 });
  }

  const items = await prisma.newsItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, url: true },
  });
  const urls = items.map((i) => i.url).filter((u): u is string => !!u);

  // Guardar os URLs para não voltarem a aparecer em futuras recolhas
  if (urls.length > 0) {
    await prisma.ignoredUrl.createMany({
      data: urls.map((url) => ({ url })),
      skipDuplicates: true,
    });
  }

  if (action === "approve") {
    await prisma.newsItem.updateMany({
      where: { id: { in: ids } },
      data: { status: "aprovada" },
    });
  } else {
    // Rejeitar = apagar (limpando relações primeiro)
    await prisma.generatedText.deleteMany({ where: { newsItemId: { in: ids } } });
    await prisma.newsItem.deleteMany({ where: { id: { in: ids } } });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
