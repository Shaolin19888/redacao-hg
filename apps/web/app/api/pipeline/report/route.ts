import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWeeklyReport } from "@/lib/pipeline/report/run";

/**
 * Relatório semanal.
 * GET: pré-visualiza o relatório da semana anterior (constrói, NÃO envia nem marca).
 * POST { force?: boolean }: corre o relatório (envia ao Telegram). force reenvia mesmo que
 * a semana já tenha sido enviada. Só envia este resumo agregado, nada mais (regra de segurança).
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const r = await runWeeklyReport(prisma, { preview: true });
  return NextResponse.json({ weekKey: r.weekKey, weekLabel: r.weekLabel, data: r.data, text: r.text });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const r = await runWeeklyReport(prisma, { force });
  return NextResponse.json(r);
}
