import type { ApprovalDecision, PipelineState } from "@prisma/client";
import { canTransition } from "../orchestrator/state-machine";

/**
 * Mapeamento puro das decisões humanas para o estado seguinte do pipeline.
 * Dois gates: pré-escrita (WRITE_TOPIC/SKIP_TOPIC, a partir de AWAITING_TOPIC_APPROVAL)
 * e publicação (as 6 decisões, a partir de AWAITING_APPROVAL).
 * Ver docs/pipeline/arquitetura.md §5.
 */
export const DECISION_TO_STATE: Record<ApprovalDecision, PipelineState> = {
  // Gate de pré-escrita (fora do Benfica)
  WRITE_TOPIC: "TOPIC_APPROVED", // → escreve
  SKIP_TOPIC: "ARCHIVED",
  // Gate de publicação
  APPROVE_ALL: "APPROVED_ALL",
  APPROVE_TEXT_REJECT_IMAGE: "IMAGE_REJECTED",
  REJECT_TEXT_APPROVE_IMAGE: "TEXT_REJECTED",
  REJECT_ALL: "ARCHIVED",
  SAVE_DRAFT: "SAVED_DRAFT",
  CANCEL: "ARCHIVED",
};

/** A que gate pertence cada decisão. */
export const TOPIC_DECISIONS: ApprovalDecision[] = ["WRITE_TOPIC", "SKIP_TOPIC"];

export function decisionToState(decision: ApprovalDecision): PipelineState {
  return DECISION_TO_STATE[decision];
}

/**
 * Estados de origem em que cada decisão é aceite.
 *
 * "Ignorar" vale nos DOIS gates de pré-escrita: no cartão do tema e no cartão da transcrição.
 * Sem isto, o botão «Deixar cair» do cartão da conferência respondia "Decisão não aplicável
 * no estado AWAITING_TRANSCRIPT_APPROVAL" — o editor ficava com uma peça encravada e sem
 * maneira de a largar.
 */
export function requiredStatesFor(decision: ApprovalDecision): PipelineState[] {
  if (decision === "SKIP_TOPIC") return ["AWAITING_TOPIC_APPROVAL", "AWAITING_TRANSCRIPT_APPROVAL"];
  if (TOPIC_DECISIONS.includes(decision)) return ["AWAITING_TOPIC_APPROVAL"];
  return ["AWAITING_APPROVAL"];
}

/** Estado de origem principal (o primeiro da lista). Mantido para quem só precisa de um. */
export function requiredStateFor(decision: ApprovalDecision): PipelineState {
  return requiredStatesFor(decision)[0];
}

export function isDecisionApplicable(fromState: PipelineState, decision: ApprovalDecision): boolean {
  if (!requiredStatesFor(decision).includes(fromState)) return false;
  return canTransition(fromState, decisionToState(decision));
}

export const DECISION_LABELS: Record<ApprovalDecision, string> = {
  WRITE_TOPIC: "Escrever",
  SKIP_TOPIC: "Ignorar",
  APPROVE_ALL: "Aprovar e publicar",
  APPROVE_TEXT_REJECT_IMAGE: "Aprovar texto, rejeitar imagem",
  REJECT_TEXT_APPROVE_IMAGE: "Rejeitar texto (reescrever)",
  REJECT_ALL: "Rejeitar tudo",
  SAVE_DRAFT: "Guardar rascunho",
  CANCEL: "Cancelar",
};
