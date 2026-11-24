import { prisma } from "@/lib/prisma";
import type { ApprovalDecision } from "@prisma/client";
import { decisionToState, isDecisionApplicable, DECISION_LABELS } from "./decision";
import { assertTransition } from "../orchestrator/state-machine";
import { enqueueNext } from "../orchestrator/orchestrator";
import { recordDecision } from "../logging/agent-decision";

/**
 * Aplica uma decisão humana a um run em AWAITING_APPROVAL. Usado tanto pelo webhook do
 * Telegram como pela API do painel. Valida a transição, actualiza o run e a ApprovalRequest,
 * regista a decisão (auditoria) e enfileira o passo seguinte. Idempotente: se já houver
 * decisão registada, não volta a aplicar.
 */

export interface ApplyResult {
  ok: boolean;
  error?: string;
  fromState?: string;
  toState?: string;
  label?: string;
}

export async function applyApprovalDecision(
  pipelineRunId: string,
  decision: ApprovalDecision,
  decidedBy: string,
  channel: "telegram" | "painel"
): Promise<ApplyResult> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { approval: true },
  });
  if (!run) return { ok: false, error: "Run não encontrado" };

  // Idempotência: decisão já tomada.
  if (run.approval?.decidedAt) {
    return { ok: false, error: "Este pedido já foi decidido." };
  }

  if (!isDecisionApplicable(run.state, decision)) {
    return { ok: false, error: `Decisão não aplicável no estado ${run.state}.` };
  }

  const toState = decisionToState(decision);
  assertTransition(run.state, toState);

  await prisma.$transaction([
    prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: { state: toState, currentAgent: "TELEGRAM_APPROVAL", error: null },
    }),
    prisma.approvalRequest.upsert({
      where: { pipelineRunId },
      update: { decision, decidedBy, decidedAt: new Date(), channel },
      create: { pipelineRunId, decision, decidedBy, decidedAt: new Date(), channel },
    }),
  ]);

  await recordDecision({
    pipelineRunId,
    agent: "TELEGRAM_APPROVAL",
    fromState: run.state,
    toState,
    ok: true,
    output: { decision, decidedBy, channel },
  });

  // Retomar o pipeline a partir do novo estado (publicar, reescrever, arquivar, etc.).
  await enqueueNext(pipelineRunId, toState);

  return { ok: true, fromState: run.state, toState, label: DECISION_LABELS[decision] };
}
