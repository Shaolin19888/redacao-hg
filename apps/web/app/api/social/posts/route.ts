import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPostNow, processDueScheduledPosts } from "@/lib/social/publish";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Publica agendados vencidos antes de devolver a lista
  await processDueScheduledPosts();

  const posts = await prisma.socialPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      targets: { include: { account: true } },
      logs: { orderBy: { createdAt: "desc" }, include: { account: true } },
    },
  });

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { text, linkUrl, imageUrl, videoUrl, mode, scheduledAt, accountIds } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "O texto é obrigatório." }, { status: 400 });
  }
  if (!accountIds?.length) {
    return NextResponse.json({ error: "Selecciona pelo menos uma conta." }, { status: 400 });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, status: "ACTIVE" },
  });

  if (accounts.length !== accountIds.length) {
    return NextResponse.json({ error: "Uma ou mais contas não foram encontradas ou estão inactivas." }, { status: 400 });
  }

  const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

  const post = await prisma.socialPost.create({
    data: {
      text,
      linkUrl: linkUrl || null,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      mode: mode === "AUTO" ? "AUTO" : "MANUAL",
      status: "DRAFT",
      scheduledAt: parsedScheduledAt,
      targets: {
        create: accounts.map((a) => ({
          accountId: a.id,
          status: "PENDING",
        })),
      },
    },
    include: { targets: { include: { account: true } } },
  });

  if (mode === "AUTO" && !parsedScheduledAt) {
    await publishPostNow(post.id, accounts.map((a) => a.id));
    const updated = await prisma.socialPost.findUnique({
      where: { id: post.id },
      include: { targets: { include: { account: true } }, logs: true },
    });
    return NextResponse.json({ post: updated });
  }

  if (mode === "AUTO" && parsedScheduledAt) {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "SCHEDULED" },
    });
  }

  return NextResponse.json({ post });
}
