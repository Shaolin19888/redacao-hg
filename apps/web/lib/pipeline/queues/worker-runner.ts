import { Worker } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUE_PREFIX, type QueueName, type PipelineJobData } from "./definitions";
import { runAgent } from "../orchestrator/orchestrator";
import type { AgentContext } from "../contracts/agent";
import {
  buildDedupHandler,
  buildRelevanceHandler,
  buildExtractFactsHandler,
  buildFactQaHandler,
  buildWriteHandler,
  buildEditorialQaHandler,
  buildReviseHandler,
  buildSeoQaHandler,
  buildWpDraftHandler,
  buildNotifyApprovalHandler,
  buildPublishHandler,
  buildSocialDraftHandler,
  buildSocialQaHandler,
  buildDistributeHandler,
  buildImageResearchHandler,
  buildImageQaHandler,
  buildTopicApprovalHandler,
  buildTranscricaoHandler,
} from "../agents/handlers";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = import("../contracts/agent").Agent<any, any>;

/**
 * Registo fila → agente. Cada fase liga os seus agentes aqui. Uma fila sem handler
 * ainda não tem worker (os jobs esperam até a fase respectiva ligar o agente).
 */
export interface Handler {
  agent: AnyAgent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildInput: (ctx: AgentContext) => Promise<any> | any;
  /** Concorrência da fila. dedup usa 1 para decisões deterministas entre near-dups. */
  concurrency?: number;
}

const HANDLERS: Partial<Record<QueueName, Handler>> = {
  dedup: buildDedupHandler(), // Fase 1
  relevance: buildRelevanceHandler(), // Fase 2
  "extract-facts": buildExtractFactsHandler(), // Fase 2
  "fact-qa": buildFactQaHandler(), // Fase 2
  "topic-approval": buildTopicApprovalHandler(), // gate pré-escrita (fora do Benfica)
  transcricao: buildTranscricaoHandler(), // conferências de fonte primária (áudio → texto)
  write: buildWriteHandler(), // Fase 2
  "editorial-qa": buildEditorialQaHandler(), // Fase 3
  revise: buildReviseHandler(), // Ciclo de revisão (Agente Revisor / doutrina)
  "seo-qa": buildSeoQaHandler(), // Fase 3
  "wp-draft": buildWpDraftHandler(), // Fase 3
  "notify-approval": buildNotifyApprovalHandler(), // Fase 5
  publish: buildPublishHandler(), // Fase 6
  "social-draft": buildSocialDraftHandler(), // Fase 7
  "social-qa": buildSocialQaHandler(), // Fase 7
  distribute: buildDistributeHandler(), // Fase 7
  "image-research": buildImageResearchHandler(), // Fase 4
  "image-qa": buildImageQaHandler(), // Fase 4
};

/**
 * Arranca um Worker BullMQ por cada fila com handler registado.
 * Devolve os workers para permitir shutdown limpo.
 */
export function startPipelineWorkers(): Worker[] {
  const connection = getRedisConnection();
  const workers: Worker[] = [];

  for (const [queueName, handler] of Object.entries(HANDLERS) as [QueueName, Handler][]) {
    const worker = new Worker<PipelineJobData>(
      queueName,
      async (job) => {
        await runAgent(handler.agent, job.data.pipelineRunId, handler.buildInput);
      },
      { connection, prefix: QUEUE_PREFIX, concurrency: handler.concurrency ?? 2 }
    );
    worker.on("failed", (job, err) => {
      console.error(`[pipeline:${queueName}] job ${job?.id} falhou:`, err.message);
    });
    workers.push(worker);
  }

  console.log(`[pipeline] ${workers.length} worker(s) de fila activos (handlers a chegar nas próximas fases).`);
  return workers;
}
