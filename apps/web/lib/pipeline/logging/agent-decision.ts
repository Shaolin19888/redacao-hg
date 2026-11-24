import { prisma } from "@/lib/prisma";
import type { AgentName, PipelineState, Prisma } from "@prisma/client";

/**
 * Registo auditável de uma decisão de agente (regra 8). Chamado por cada step
 * após executar. Nunca lança — o registo de auditoria não pode derrubar o pipeline.
 */
export interface RecordDecisionInput {
  pipelineRunId: string;
  agent: AgentName;
  fromState?: PipelineState | null;
  toState?: PipelineState | null;
  ok: boolean;
  input?: unknown;
  output?: unknown;
  model?: string;
  promptVersion?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  error?: string;
}

export async function recordDecision(d: RecordDecisionInput): Promise<void> {
  try {
    await prisma.agentDecision.create({
      data: {
        pipelineRunId: d.pipelineRunId,
        agent: d.agent,
        fromState: d.fromState ?? null,
        toState: d.toState ?? null,
        ok: d.ok,
        input: (d.input ?? undefined) as Prisma.InputJsonValue | undefined,
        output: (d.output ?? undefined) as Prisma.InputJsonValue | undefined,
        model: d.model,
        promptVersion: d.promptVersion,
        tokensIn: d.tokensIn,
        tokensOut: d.tokensOut,
        durationMs: d.durationMs,
        error: d.error,
      },
    });
  } catch (err) {
    // Auditoria com melhor esforço: se falhar, regista na consola mas não interrompe.
    console.error("[agent-decision] falha ao registar decisão:", err);
  }
}
