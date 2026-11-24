import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SocialPlatform } from "@prisma/client";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION, buildSocialSystem } from "../llm/prompts";
import { composeSocialText, stripCallToAction } from "../social/compose-heuristic";
import { CHAR_LIMITS } from "../social/limits";
import { completeJSON, resolveLlmMode } from "../llm/client";

const socialLlmSchema = z.object({ text: z.string() });

/**
 * Gera copy CURTA e CHAMATIVA com o LLM (sem CTA nem link). Recorre à heurística se o LLM
 * falhar, vier vazio ou exceder o limite da plataforma. O link é sempre anexado à parte.
 */
async function generateSocialCopy(
  article: { title: string; lead: string | null; tags: string[] },
  link: string,
  limit: number | null
): Promise<{ text: string; model: string; tokensIn?: number; tokensOut?: number }> {
  const heuristic = () => ({
    text: composeSocialText({ title: article.title, lead: article.lead, link, tags: article.tags, charLimit: limit }),
    model: "heuristico",
  });

  if ((await resolveLlmMode()) !== "real") return heuristic();

  try {
    const user = `Título: ${article.title}
Resumo: ${article.lead ?? "(sem resumo)"}
Temas para hashtags: ${article.tags.slice(0, 5).join(", ") || "Benfica"}
Limite de caracteres da plataforma mais restritiva: ${limit ?? "sem limite"} (deixa margem para o link anexado à parte).
Escreve a copy curta e chamativa.`;
    const r = await completeJSON({ tier: "fast", system: buildSocialSystem(), user, schema: socialLlmSchema });
    const text = stripCallToAction(r.data.text).trim();
    const linkReserve = link ? link.length + 2 : 0;
    if (!text || (limit && text.length + linkReserve > limit)) return heuristic();
    return { text, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch {
    return heuristic();
  }
}

/**
 * Social Draft Agent — a partir do artigo publicado, gera copy para redes e cria
 * um SocialPost RASCUNHO (mode MANUAL, status DRAFT) ligado ao run, com as contas
 * activas como destinos. NÃO publica (regra §20: nada em redes sem aprovação humana).
 * PUBLISHED → SOCIAL_DRAFTED.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({
  socialPostId: z.string().nullable(),
  targetCount: z.number(),
  textLength: z.number(),
});

export const socialDraftAgent = defineAgent({
  name: "SOCIAL_PUBLISHER",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: { article: true, wpDraft: true },
    });
    if (!run?.article) throw new Error("Social Draft sem artigo");

    const link = run.wpDraft?.link ?? "";
    const accounts = await prisma.socialAccount.findMany({ where: { status: "ACTIVE" } });

    // Limite mais restritivo entre as plataformas de destino (ou X por defeito se não há contas).
    const platforms: SocialPlatform[] = accounts.length > 0 ? accounts.map((a) => a.platform) : ["X"];
    const limit = platforms.reduce<number | null>((min, p) => {
      const l = CHAR_LIMITS[p];
      if (l == null) return min;
      return min == null ? l : Math.min(min, l);
    }, null);

    const copy = await generateSocialCopy(
      { title: run.article.title, lead: run.article.lead, tags: run.article.tags },
      link,
      limit
    );
    const text = copy.text;

    // Substitui rascunho social anterior deste run (idempotência em re-execução).
    await prisma.socialPost.deleteMany({ where: { pipelineRunId: input.pipelineRunId, status: "DRAFT" } });

    const post = await prisma.socialPost.create({
      data: {
        text,
        linkUrl: link || null,
        mode: "MANUAL",
        status: "DRAFT",
        pipelineRunId: input.pipelineRunId,
        targets: accounts.length > 0
          ? { create: accounts.map((a) => ({ accountId: a.id, status: "PENDING" as const })) }
          : undefined,
      },
    });

    return {
      nextState: "SOCIAL_DRAFTED" as const,
      output: { socialPostId: post.id, targetCount: accounts.length, textLength: text.length },
      audit: { model: copy.model, promptVersion: PROMPT_VERSION, tokensIn: copy.tokensIn, tokensOut: copy.tokensOut },
    };
  },
});
