import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Detalhe de um run: candidato, ledger de factos, artigo e trilho de decisões.
 * É a vista auditável de ponta a ponta de um artigo (regra 8).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: {
      candidate: { include: { source: { select: { name: true } } } },
      ledger: { include: { facts: { orderBy: { createdAt: "asc" } } } },
      article: true,
      qaReports: { orderBy: { createdAt: "asc" } },
      wpDraft: true,
      image: true,
      approval: true,
      socialPosts: { include: { targets: { include: { account: { select: { platform: true, accountName: true } } } } }, orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!run) return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  return NextResponse.json({ run });
}
