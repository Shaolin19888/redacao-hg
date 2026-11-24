import { z } from "zod";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { notifyPublishApproval } from "../approval/notify";

/**
 * Telegram Approval Agent — envia o pedido de aprovação humana e coloca o run em
 * AWAITING_APPROVAL (gate humano: o pipeline PAUSA aqui). A retoma acontece pelo
 * webhook do Telegram ou pelo painel. Se o Telegram não estiver configurado, o pedido
 * fica em modo simulado e é decidido pelo painel. Nada avança sem decisão humana.
 */

const inputSchema = z.object({
  pipelineRunId: z.string(),
});

const outputSchema = z.object({
  channel: z.string(),
  sent: z.boolean(),
  simulated: z.boolean(),
});

export const telegramApprovalAgent = defineAgent({
  name: "TELEGRAM_APPROVAL",
  inputSchema,
  outputSchema,
  async run(input) {
    const result = await notifyPublishApproval(input.pipelineRunId);

    return {
      nextState: "AWAITING_APPROVAL" as const,
      output: { channel: result.simulated ? "simulado" : "telegram", sent: result.sent, simulated: result.simulated },
      audit: { model: result.simulated ? "simulado" : "telegram", promptVersion: PROMPT_VERSION },
    };
  },
});
