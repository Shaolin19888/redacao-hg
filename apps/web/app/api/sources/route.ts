import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { newsItems: true } } },
  });

  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { name, url, rssUrl } = await req.json();

  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "Nome e URL são obrigatórios" }, { status: 400 });
  }

  const source = await prisma.source.create({
    data: {
      name: name.trim(),
      url: url.trim(),
      rssUrl: rssUrl?.trim() || null,
      active: true,
      autoPublish: false,
      autoModel: "openai",
    },
    include: { _count: { select: { newsItems: true } } },
  });

  return NextResponse.json(source, { status: 201 });
}
