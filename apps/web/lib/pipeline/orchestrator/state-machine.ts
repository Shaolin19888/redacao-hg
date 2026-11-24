import { PipelineState } from "@prisma/client";
import type { QueueName } from "../queues/definitions";

/**
 * Máquina de estados do artigo. Transições declaradas explicitamente: uma transição
 * não listada é inválida e lança erro (nunca avança em silêncio).
 * Ver docs/pipeline/arquitetura.md §5.
 */
export const TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  COLLECTED: ["DEDUP_OK", "ARCHIVED", "FAILED"],
  DEDUP_OK: ["RELEVANT", "ARCHIVED", "FAILED"],
  // Fora do Benfica: gate humano de pré-escrita ANTES da extracção de factos, para não
  // gastar sequer a chamada de factos em notícias que o editor vai ignorar.
  RELEVANT: ["FACTS_EXTRACTED", "AWAITING_TOPIC_APPROVAL", "ARCHIVED", "FAILED"],
  FACTS_EXTRACTED: ["FACTS_QA_OK", "ARCHIVED", "FAILED"],
  FACTS_QA_OK: ["WRITTEN", "ARCHIVED", "FAILED"],
  AWAITING_TOPIC_APPROVAL: ["TOPIC_APPROVED", "ARCHIVED", "FAILED"],
  // Conferências de fonte primária passam pela transcrição antes dos factos.
  TOPIC_APPROVED: ["TRANSCRIBED", "FACTS_EXTRACTED", "ARCHIVED", "FAILED"],
  TRANSCRIBED: ["AWAITING_TRANSCRIPT_APPROVAL", "FACTS_EXTRACTED", "ARCHIVED", "FAILED"],
  AWAITING_TRANSCRIPT_APPROVAL: ["FACTS_EXTRACTED", "ARCHIVED", "FAILED"],
  WRITTEN: ["EDITORIAL_QA_OK", "TEXT_REJECTED", "FAILED"],
  // Depois do QA mecânico (cópia/invenção), o Agente Revisor confronta com a doutrina.
  EDITORIAL_QA_OK: ["REVISED_OK", "TEXT_REJECTED", "FAILED"],
  // Revisão de doutrina aprovada (ou passada com aviso de verificação humana reforçada).
  REVISED_OK: ["SEO_QA_OK", "FAILED"],
  // Imagem é opcional: quando desligada, salta directamente para o rascunho WP.
  SEO_QA_OK: ["IMAGE_READY", "WP_DRAFTED", "FAILED"],
  IMAGE_READY: ["IMAGE_QA_OK", "IMAGE_REJECTED", "FAILED"],
  IMAGE_QA_OK: ["WP_DRAFTED", "IMAGE_REJECTED", "FAILED"],
  WP_DRAFTED: ["AWAITING_APPROVAL", "FAILED"],
  AWAITING_APPROVAL: [
    "APPROVED_ALL",
    "TEXT_REJECTED",
    "IMAGE_REJECTED",
    "SAVED_DRAFT",
    "ARCHIVED",
    "FAILED",
  ],
  APPROVED_ALL: ["PUBLISHED", "FAILED"],
  // Re-entradas no ciclo de escrita / imagem
  TEXT_REJECTED: ["WRITTEN", "ARCHIVED", "FAILED"],
  IMAGE_REJECTED: ["IMAGE_READY", "ARCHIVED", "FAILED"],
  SAVED_DRAFT: ["PAUSED", "AWAITING_APPROVAL", "ARCHIVED"],
  PUBLISHED: ["SOCIAL_DRAFTED", "DONE", "FAILED"],
  SOCIAL_DRAFTED: ["SOCIAL_QA_OK", "FAILED"],
  SOCIAL_QA_OK: ["DISTRIBUTED", "FAILED"],
  DISTRIBUTED: ["DONE", "FAILED"],
  // Estados de repouso / terminais
  DONE: [],
  PAUSED: ["AWAITING_APPROVAL", "ARCHIVED"],
  ARCHIVED: [],
  FAILED: ["COLLECTED", "ARCHIVED"], // retry recomeça; ou arquiva
};

/** Estados terminais: o pipeline não avança mais. */
export const TERMINAL_STATES: PipelineState[] = ["DONE", "ARCHIVED"];

/** Estados que aguardam decisão humana. */
export const HUMAN_GATE_STATES: PipelineState[] = ["AWAITING_APPROVAL", "AWAITING_TOPIC_APPROVAL", "AWAITING_TRANSCRIPT_APPROVAL", "PAUSED"];

/**
 * Fila a enfileirar quando o run ENTRA num estado. Estados que aguardam humano ou
 * terminais não enfileiram nada (o pipeline pausa até intervenção).
 */
export const STATE_TO_NEXT_QUEUE: Partial<Record<PipelineState, QueueName>> = {
  COLLECTED: "dedup",
  DEDUP_OK: "relevance",
  RELEVANT: "extract-facts", // fallback quando o gate de tópico está desligado
  FACTS_EXTRACTED: "fact-qa",
  FACTS_QA_OK: "write",
  WRITTEN: "editorial-qa",
  EDITORIAL_QA_OK: "revise",
  REVISED_OK: "seo-qa",
  SEO_QA_OK: "image-research",
  IMAGE_READY: "image-qa",
  IMAGE_QA_OK: "wp-draft",
  // Gate de pré-escrita aprovado: passa pela transcrição, que decide se há vídeo a transcrever.
  TOPIC_APPROVED: "transcricao",
  WP_DRAFTED: "notify-approval",
  APPROVED_ALL: "publish",
  PUBLISHED: "social-draft",
  SOCIAL_DRAFTED: "social-qa",
  SOCIAL_QA_OK: "distribute",
  // Re-entradas
  TEXT_REJECTED: "write",
  IMAGE_REJECTED: "image-research",
};

export function canTransition(from: PipelineState, to: PipelineState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PipelineState, to: PipelineState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} → ${to}`);
  }
}

export function isTerminal(state: PipelineState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function isHumanGate(state: PipelineState): boolean {
  return HUMAN_GATE_STATES.includes(state);
}
