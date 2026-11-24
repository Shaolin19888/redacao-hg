import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { publishPostNow } from "@/lib/social/publish";

/**
 * Distribute Agent — distribui o post social pelas redes configuradas, reutilizando
 * o Social Hub (publishPostNow). SÓ é alcançável quando a auto-distribuição está
 * explicitamente ligada (Setting `pipeline_social_autodistribute`); por defeito o run
 * repousa em SOCIAL_QA_OK e o humano distribui pelo Social Hub (regra §20).
 * Modo real publica; modo simulado marca sem tocar nas redes. SOCIAL_QA_OK → DISTRIBUTED.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({
  simulated: z.boolean(),
  targets: z.number(),
});

async function resolveSocialMode(): Promise<"real" | "simulado"> {
  const setting = await prisma.setting.findUnique({ where: { key: "pipeline_social_mode" } });
  return setting?.value === "real" ? "real" : "simulado";
}

export const distributeAgent = defineAgent({
  name: "SOCIAL_PUBLISHER",
  inputSchema,
  outputSchema,
  async run(input) {
    const post = await prisma.socialPost.findFirst({
      where: { pipelineRunId: input.pipelineRunId, status: "DRAFT" },
      include: { targets: true },
      orderBy: { createdAt: "desc" },
    });
    if (!post) throw new Error("Distribuição sem post social");

    const mode = await resolveSocialMode();
    const hasTargets = post.targets.length > 0;

    if (mode === "real" && hasTargets) {
      await publishPostNow(post.id);
    } else {
      // Simulado: marca como publicado sem tocar nas redes.
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHED" },
      });
    }

    return {
      nextState: "DISTRIBUTED" as const,
      output: { simulated: mode === "simulado" || !hasTargets, targets: post.targets.length },
      audit: { model: mode === "real" && hasTargets ? "social-hub" : "simulado", promptVersion: PROMPT_VERSION },
    };
  },
});
