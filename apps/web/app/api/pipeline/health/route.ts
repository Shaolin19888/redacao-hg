import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSiteHealth } from "@/lib/pipeline/health/run";

/** GET: último relatório + histórico curto. POST: corre uma verificação agora. */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const reports = await prisma.siteHealthReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json({ latest: reports[0] ?? null, history: reports });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const report = await runSiteHealth();
  return NextResponse.json({ ok: true, report });
}
