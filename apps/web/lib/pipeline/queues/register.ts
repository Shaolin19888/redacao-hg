import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUE_NAMES, QUEUE_PREFIX, DEFAULT_JOB_OPTS, type QueueName, type PipelineJobData } from "./definitions";

/**
 * Registo de filas (lado do produtor). Instâncias Queue criadas uma vez e reutilizadas.
 * Os Workers vivem no processo worker.ts — ver lib/pipeline/queues/worker-runner.ts.
 */
const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const q = new Queue(name, {
    connection: getRedisConnection(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
  queues.set(name, q);
  return q;
}

/** Enfileira o próximo passo do pipeline. */
export async function enqueue(name: QueueName, data: PipelineJobData) {
  return getQueue(name).add(name, data);
}

export { QUEUE_NAMES };
export type { QueueName, PipelineJobData };
