import { NextRequest, NextResponse } from "next/server";
import type { AuditDecision } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAuditCsv } from "@/lib/pipeline/audit/report";

/** Exporta o relatório de triagem de um lote em CSV, ordenado por prioridade de corte. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const items = await prisma.auditItem.findMany({
    where: { auditRunId: id },
    orderBy: [{ score: "desc" }, { impressions16m: "asc" }],
  });

  const csv = buildAuditCsv(
    items.map((it) => ({
      url: it.url,
      title: it.title,
      publishedAt: it.publishedAt,
      clicks16m: it.clicks16m,
      impressions16m: it.impressions16m,
      indexedGuess: it.indexedGuess,
      suggestedDecision: it.suggestedDecision as AuditDecision,
      reason: it.reason,
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-${id}.csv"`,
    },
  });
}
