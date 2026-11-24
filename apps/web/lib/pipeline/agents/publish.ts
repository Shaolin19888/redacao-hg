import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { publishPost } from "@/lib/wordpress/posts";
import { createWpDraftForRun } from "../wordpress/create-post";

/**
 * Publish Agent — CRIA o post no WordPress (com o texto FINAL, já revisto/editado) e publica.
 * Só é alcançável a partir de APPROVED_ALL, que só existe após o humano aprovar (regra 1). O
 * post é criado agora (não antes), para o editor rever/editar o texto sem deixar rascunhos no
 * site nem gerar duplicados. Modo simulado não toca no WordPress. → PUBLISHED.
 */

const inputSchema = z.object({
  pipelineRunId: z.string(),
});

const outputSchema = z.object({
  action: z.enum(["real", "simulado"]),
  wpPostId: z.number().nullable(),
  link: z.string().nullable(),
});

async function resolveWpMode(): Promise<"real" | "simulado"> {
  const hasCreds = !!(process.env.WORDPRESS_URL && process.env.WORDPRESS_USER && process.env.WORDPRESS_APP_PASSWORD);
  if (!hasCreds) return "simulado";
  const setting = await prisma.setting.findUnique({ where: { key: "pipeline_wp_mode" } });
  return setting?.value === "real" ? "real" : "simulado";
}

export const publishAgent = defineAgent({
  name: "WP_DRAFT_PUBLISHER",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: { approval: true, wpDraft: true },
    });
    if (!run) throw new Error("Publicação sem run");

    const action = await resolveWpMode();
    const approvedBy = run.approval?.decidedBy ?? "desconhecido";

    // Idempotência: se uma tentativa anterior já criou o post, reutiliza-o (evita duplicados).
    let wpPostId: number | null = run.wpDraft?.wpPostId ?? null;
    let link: string | null = null;
    let error: string | null = null;
    let status = "published-simulado";

    if (action === "real") {
      try {
        // Cria o post no WordPress AGORA, com o texto final (se ainda não foi criado), e publica-o.
        if (!wpPostId) {
          const created = await createWpDraftForRun(input.pipelineRunId);
          wpPostId = created.wpPostId;
        }
        const post = await publishPost(wpPostId);
        link = post.link;
        status = post.status;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        status = "failed";
      }
    }

    await prisma.wpDraft.update({
      where: { pipelineRunId: input.pipelineRunId },
      data: {
        wpPostId,
        status,
        link,
        error,
        publishedAt: error ? null : new Date(),
        publishedBy: approvedBy,
        simulated: action === "simulado" || !!error,
      },
    });

    if (error) throw new Error(`Falha ao publicar no WordPress: ${error}`);

    return {
      nextState: "PUBLISHED" as const,
      output: { action, wpPostId, link },
      audit: { model: action === "real" ? "wordpress-api" : "simulado", promptVersion: PROMPT_VERSION },
    };
  },
});
