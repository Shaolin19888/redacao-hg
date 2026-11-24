import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const action = searchParams.get("action") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const where = {
    ...(action ? { action } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" as const } },
            { details: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.log.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
