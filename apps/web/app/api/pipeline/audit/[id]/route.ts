import { NextRequest, NextResponse } from "next/server";
import type { AuditDecision, AuditHumanDecision } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET: detalhe de um lote de auditoria (totais + itens ordenados por prioridade de corte).
 * PATCH { itemId, humanDecision, overrideDecision? }: regista a decisão do Hugo por item
 * (ACEITO / RECUSO / OVERRIDE). NÃO executa nada — só guarda a ordem humana (regra §37).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const run = await prisma.auditRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });

  const items = await prisma.auditItem.findMany({
    where: { auditRunId: id },
    orderBy: [{ score: "desc" }, { impressions16m: "asc" }],
  });
  return NextResponse.json({ run, items });
}

const VALID_HUMAN: AuditHumanDecision[] = ["PENDING", "ACCEPT", "REJECT", "OVERRIDE"];
const VALID_DECISION: AuditDecision[] = ["DELETE", "MERGE", "IMPROVE", "KEEP"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const itemId = String(body?.itemId ?? "");
  const humanDecision = body?.humanDecision as AuditHumanDecision;
  const overrideDecision = body?.overrideDecision as AuditDecision | undefined;

  if (!itemId || !VALID_HUMAN.includes(humanDecision)) {
    return NextResponse.json({ error: "Decisão inválida" }, { status: 400 });
  }
  if (humanDecision === "OVERRIDE" && !VALID_DECISION.includes(overrideDecision as AuditDecision)) {
    return NextResponse.json({ error: "OVERRIDE exige overrideDecision válida" }, { status: 400 });
  }

  const item = await prisma.auditItem.findFirst({ where: { id: itemId, auditRunId: id } });
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const updated = await prisma.auditItem.update({
    where: { id: itemId },
    data: {
      humanDecision,
      overrideDecision: humanDecision === "OVERRIDE" ? (overrideDecision as AuditDecision) : null,
    },
  });
  return NextResponse.json({ ok: true, item: updated });
}
