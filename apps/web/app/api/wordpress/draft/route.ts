import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDraft } from "@/lib/wordpress/posts";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    newsItemId,
    title,
    subtitulo,
    content,
    excerpt,
    slug,
    categoryNames,
    tagNames,
    metaTitle,
    metaDescription,
    pushTitle,
    pushBody,
    onesignalTitle,
    featuredMediaId,
    status,
  } = body;

  if (!title || !content || !slug) {
    return NextResponse.json({ error: "title, content e slug são obrigatórios" }, { status: 400 });
  }

  try {
    const post = await createDraft({
      title,
      subtitulo,
      content,
      excerpt: excerpt ?? "",
      slug,
      categoryNames: categoryNames ?? [],
      tagNames: tagNames ?? [],
      metaTitle,
      metaDescription,
      pushTitle,
      pushBody,
      onesignalTitle,
      featuredMediaId: featuredMediaId ?? null,
      status: status ?? "draft",
    });

    const action = status === "publish" ? "wp_publish" : "wp_draft";
    const label = status === "publish" ? "Publicado" : "Rascunho criado";

    await prisma.log.create({
      data: {
        action,
        details: `${label} no WordPress: "${title}" (ID ${post.id}) — ${post.link}`,
        userId: session.user?.id,
      },
    });

    if (newsItemId) {
      await prisma.newsItem.update({
        where: { id: newsItemId },
        data: { status: status === "publish" ? "publicada" : "rascunho_wp" },
      });
    }

    return NextResponse.json({ id: post.id, link: post.link, status: post.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
