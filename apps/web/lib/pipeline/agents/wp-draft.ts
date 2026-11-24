import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";

/**
 * WP Draft "Publisher" — NÃO cria nada no WordPress. Apenas marca a peça como pronta para
 * revisão/aprovação humana. O texto é enviado ao editor no Telegram (a partir da BD); só
 * DEPOIS de ele rever/editar e aprovar é que o post é criado no site (na publicação). Isto
 * evita rascunhos duplicados no site e gasto de recursos antes da edição. → WP_DRAFTED.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({ ready: z.boolean() });

export const wpDraftAgent = defineAgent({
  name: "WP_DRAFT_PUBLISHER",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: { article: true },
    });
    if (!run?.article) throw new Error("WP Draft sem artigo");

    // Regista o WpDraft como "por criar" (sem post no WP ainda). O post real é criado na
    // publicação, com o texto final. Assim o editor edita o texto sem gerar rascunhos no site.
    await prisma.wpDraft.upsert({
      where: { pipelineRunId: input.pipelineRunId },
      update: { wpPostId: null, link: null, status: "aguarda-aprovacao", simulated: true, error: null },
      create: { pipelineRunId: input.pipelineRunId, wpPostId: null, link: null, status: "aguarda-aprovacao", simulated: true },
    });

    return {
      nextState: "WP_DRAFTED" as const,
      output: { ready: true },
      audit: { model: "sem-wp", promptVersion: PROMPT_VERSION },
    };
  },
});
