import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const sourceId = searchParams.get("sourceId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 30;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (sourceId) where.sourceId = sourceId;

  const [items, total] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      include: { source: { select: { name: true } } },
    }),
    prisma.newsItem.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}
