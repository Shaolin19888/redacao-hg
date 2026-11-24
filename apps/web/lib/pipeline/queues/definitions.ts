/**
 * Definição declarativa das filas do pipeline. Uma fila por etapa para isolar
 * concorrência e falhas. A ordem espelha a máquina de estados.
 * Ver docs/pipeline/arquitetura.md §3.
 */
export const QUEUE_NAMES = [
  "collect",
  "dedup",
  "relevance",
  "extract-facts",
  "fact-qa",
  "topic-approval",
  "transcricao",
  "write",
  "editorial-qa",
  "revise",
  "seo-qa",
  "image-research",
  "image-qa",
  "wp-draft",
  "notify-approval",
  "publish",
  "social-draft",
  "social-qa",
  "distribute",
  "site-health",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Prefixo comum para namespacing das chaves BullMQ no Redis. */
export const QUEUE_PREFIX = "redacaohg";

/** Opções por defeito de cada job: retries com backoff exponencial + limpeza. */
export const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Payload mínimo que todos os jobs do pipeline transportam. */
export interface PipelineJobData {
  pipelineRunId: string;
}
