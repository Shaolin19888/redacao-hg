import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractArticleContent } from "@/lib/sources/article-extractor";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { newsItemId } = await req.json();
  if (!newsItemId) return NextResponse.json({ error: "newsItemId obrigatório" }, { status: 400 });

  const newsItem = await prisma.newsItem.findUnique({
    where: { id: newsItemId },
    include: { source: true },
  });
  if (!newsItem) return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });

  let conteudoExtraido: string | null = null;
  let erroExtracao: string | null = null;

  try {
    conteudoExtraido = await extractArticleContent(newsItem.url);
  } catch (err) {
    erroExtracao = err instanceof Error ? err.message : "Erro desconhecido";
  }

  const conteudoUsado = conteudoExtraido && conteudoExtraido.length > 100
    ? conteudoExtraido
    : newsItem.summary;

  return NextResponse.json({
    titulo: newsItem.title,
    url: newsItem.url,
    fonte: newsItem.source.name,
    resumoBD: newsItem.summary,
    conteudoExtraido,
    conteudoUsado,
    erroExtracao,
    usouExtracaoCompleta: !!(conteudoExtraido && conteudoExtraido.length > 100),
  });
}
