import { z } from "zod";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { notifyTopicApproval } from "../approval/notify";

/**
 * Topic Approval Agent — gate de PRÉ-ESCRITA para notícias fora do Benfica.
 * Pergunta ao humano (Telegram/painel) se vale a pena tratar a notícia ANTES de gastar
 * créditos a extrair factos e a escrever. RELEVANT → AWAITING_TOPIC_APPROVAL (pausa).
 * Aprovar (WRITE_TOPIC) → extrai factos e escreve; ignorar (SKIP_TOPIC) → arquiva.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({ channel: z.string(), sent: z.boolean() });

export const topicApprovalAgent = defineAgent({
  name: "TELEGRAM_APPROVAL",
  inputSchema,
  outputSchema,
  async run(input) {
    const result = await notifyTopicApproval(input.pipelineRunId);
    return {
      nextState: "AWAITING_TOPIC_APPROVAL" as const,
      output: { channel: result.simulated ? "simulado" : "telegram", sent: result.sent },
      audit: { model: result.simulated ? "simulado" : "telegram", promptVersion: PROMPT_VERSION },
    };
  },
});
