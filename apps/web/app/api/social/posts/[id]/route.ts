import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPostNow } from "@/lib/social/publish";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.socialPost.findUnique({
    where: { id },
    include: {
      targets: { include: { account: true } },
      logs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const post = await prisma.socialPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

  // Publicar manualmente agora
  if (body.action === "publish") {
    if (post.status === "PUBLISHED") {
      return NextResponse.json({ error: "Post já publicado." }, { status: 400 });
    }
    await publishPostNow(id);
    const updated = await prisma.socialPost.findUnique({
      where: { id },
      include: { targets: { include: { account: true } }, logs: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({ post: updated });
  }

  // Republicar — cria novo post com o mesmo conteúdo e publica imediatamente
  if (body.action === "republish") {
    const original = await prisma.socialPost.findUnique({
      where: { id },
      include: { targets: { include: { account: true } } },
    });
    if (!original) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });

    const accountIds = original.targets.map((t) => t.accountId);
    const accounts = await prisma.socialAccount.findMany({
      where: { id: { in: accountIds }, status: "ACTIVE" },
    });
    if (accounts.length === 0) {
      return NextResponse.json({ error: "Nenhuma conta activa para republicar." }, { status: 400 });
    }

    const newPost = await prisma.socialPost.create({
      data: {
        text: original.text,
        linkUrl: original.linkUrl,
        imageUrl: original.imageUrl,
        videoUrl: original.videoUrl,
        mode: "AUTO",
        status: "DRAFT",
        targets: { create: accounts.map((a) => ({ accountId: a.id, status: "PENDING" })) },
      },
    });

    await publishPostNow(newPost.id);

    const updated = await prisma.socialPost.findUnique({
      where: { id: newPost.id },
      include: { targets: { include: { account: true } }, logs: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({ post: updated });
  }

  // Actualizar agendamento
  if (body.scheduledAt !== undefined) {
    const updated = await prisma.socialPost.update({
      where: { id },
      data: {
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
      },
    });
    return NextResponse.json({ post: updated });
  }

  return NextResponse.json({ error: "Acção inválida." }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const post = await prisma.socialPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

  if (post.status === "PUBLISHED") {
    return NextResponse.json({ error: "Não é possível apagar um post já publicado." }, { status: 400 });
  }

  await prisma.socialPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
