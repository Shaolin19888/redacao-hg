import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runContentAudit } from "@/lib/pipeline/audit/run-audit";

/**
 * Auditoria de conteúdo.
 * GET: último lote + histórico de lotes.
 * POST { limit?, offset?, order?, gscCsv?, useAI? }: corre um lote (default 100). Só LÊ do
 * WordPress e propõe; NADA é apagado (a execução é um passo humano posterior).
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const runs = await prisma.auditRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ latest: runs[0] ?? null, runs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(1, Number(body?.limit) || 100), 500); // lote de teste = 100; teto de segurança
  const offset = Math.max(0, Number(body?.offset) || 0);
  const order = body?.order === "desc" ? "desc" : "asc";
  const gscCsv = typeof body?.gscCsv === "string" ? body.gscCsv : undefined;
  const useAI = body?.useAI !== false;

  try {
    const r = await runContentAudit(prisma, { limit, offset, order, gscCsv, useAI });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
