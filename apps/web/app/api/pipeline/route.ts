import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lista os runs do pipeline com contagem por estado. Fase 0: painel de leitura.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [runs, grouped, candidateTotal, duplicateTotal] = await Promise.all([
    prisma.pipelineRun.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        decisions: { orderBy: { createdAt: "desc" }, take: 1 },
        candidate: { select: { title: true, url: true, duplicateOfId: true } },
        _count: { select: { decisions: true } },
      },
    }),
    prisma.pipelineRun.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.candidate.count(),
    prisma.candidate.count({ where: { duplicateOfId: { not: null } } }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.state, g._count._all]));

  return NextResponse.json({ runs, counts, candidateTotal, duplicateTotal });
}
