import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSimulatedCollection, collectFromSource } from "@/lib/pipeline/agents/source-manager";

/** Lista as fontes com pipeline ligado (para o painel escolher de onde recolher). */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const sources = await prisma.source.findMany({
    where: { pipelineEnabled: true, active: true },
    select: { id: true, name: true, collectType: true, lastError: true, lastPipelineRun: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ sources });
}

/**
 * Dispara a recolha do Source Manager. Fase 1: por defeito corre a recolha SIMULADA,
 * que injecta candidatos no pipeline (incluindo near-duplicados) para exercitar o fluxo.
 * Body opcional: { sourceId } para recolher de uma fonte específica.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = body.sourceId
    ? await collectFromSource(body.sourceId)
    : await runSimulatedCollection();

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, result });
}
