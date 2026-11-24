import { NextRequest, NextResponse } from "next/server";
import type { ApprovalDecision } from "@prisma/client";
import { auth } from "@/lib/auth";
import { applyApprovalDecision } from "@/lib/pipeline/approval/apply-decision";

/**
 * Aprovação humana pelo painel (fallback e complemento ao Telegram). Autenticado.
 * O painel permite intervenção humana em qualquer momento (CLAUDE.md §24).
 */

const VALID = new Set<string>([
  "APPROVE_ALL", "APPROVE_TEXT_REJECT_IMAGE", "REJECT_TEXT_APPROVE_IMAGE",
  "REJECT_ALL", "SAVE_DRAFT", "CANCEL", "WRITE_TOPIC", "SKIP_TOPIC",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as string;
  if (!VALID.has(decision)) {
    return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
  }

  const decidedBy = session.user?.email ?? session.user?.name ?? "painel";
  const result = await applyApprovalDecision(id, decision as ApprovalDecision, decidedBy, "painel");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
