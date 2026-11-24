import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION, buildSeoSystem } from "../llm/prompts";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { generateSeo } from "../seo/generate-heuristic";
import { stripMediaAttribution, titleAttributesToOutlet } from "../editorial/media-outlets";

const seoLlmSchema = z.object({
  seoTitle: z.string().min(5),
  discoverTitle: z.string().min(5),
  metaDescription: z.string().min(40),
});

/**
 * Gera título SEO, título Discover e meta descrição com a DOUTRINA injectada em runtime.
 * Devolve null em modo simulado ou se o modelo falhar (fica a heurística).
 */
async function generateSeoTitles(article: { title: string; lead: string | null; body: string }) {
  if ((await resolveLlmMode()) !== "real") return null;
  const user = `Artigo.

Título atual: ${article.title}

Lead: ${article.lead ?? ""}

Texto:
${article.body.slice(0, 2500)}`;
  try {
    const r = await completeJSON({ tier: "fast", system: buildSeoSystem(), user, schema: seoLlmSchema });
    return r.data;
  } catch {
    return null;
  }
}

/**
 * SEO/Discover QA Agent — gera e valida título SEO, slug, meta descrição, título
 * Discover, tags e categoria, guardando-os no Article. EDITORIAL_QA_OK → SEO_QA_OK.
 */

const inputSchema = z.object({
  pipelineRunId: z.string(),
  category: z.string().nullable(),
});

const outputSchema = z.object({
  slug: z.string(),
  seoTitleLen: z.number(),
  metaLen: z.number(),
  tagCount: z.number(),
  issueCount: z.number(),
});

export const seoQaAgent = defineAgent({
  name: "SEO_QA",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: {
        article: true,
        ledger: { include: { facts: { where: { status: "CONFIRMED" } } } },
      },
    });
    if (!run?.article) throw new Error("SEO QA sem artigo");

    const factTexts = (run.ledger?.facts ?? []).map((f) => f.text);
    const seo = generateSeo({
      title: run.article.title,
      lead: run.article.lead,
      factTexts,
      category: input.category,
    });

    // Títulos com a doutrina (carregada do ficheiro em runtime). Se o modelo falhar ou não
    // estiver em modo real, ficam os da heurística. A regra 3 (nunca citar um órgão) é
    // aplicada SEMPRE, de forma determinista, ao que quer que saia.
    const llm = await generateSeoTitles({
      title: run.article.title,
      lead: run.article.lead,
      body: run.article.body,
    });
    if (llm) {
      seo.fields.seoTitle = llm.seoTitle;
      seo.fields.discoverTitle = llm.discoverTitle;
      seo.fields.metaDescription = llm.metaDescription;
    }
    seo.fields.seoTitle = stripMediaAttribution(seo.fields.seoTitle);
    seo.fields.discoverTitle = stripMediaAttribution(seo.fields.discoverTitle);
    if (titleAttributesToOutlet(seo.fields.discoverTitle) || titleAttributesToOutlet(seo.fields.seoTitle)) {
      seo.issues.push({
        type: "discoverTitle",
        severity: "warning",
        detail: "Título cita um órgão de comunicação (regra 3 da doutrina). Reescrever a liderar pelo tema.",
      });
    }

    await prisma.article.update({
      where: { id: run.article.id },
      data: {
        slug: seo.fields.slug,
        seoTitle: seo.fields.seoTitle,
        metaDescription: seo.fields.metaDescription,
        discoverTitle: seo.fields.discoverTitle,
        tags: seo.fields.tags,
        category: seo.fields.category,
      },
    });

    await prisma.qAReport.create({
      data: {
        pipelineRunId: input.pipelineRunId,
        stage: "seo",
        agent: "SEO_QA",
        passed: seo.passed,
        issues: seo.issues as unknown as object[],
      },
    });

    return {
      nextState: "SEO_QA_OK" as const,
      output: {
        slug: seo.fields.slug,
        seoTitleLen: seo.fields.seoTitle.length,
        metaLen: seo.fields.metaDescription.length,
        tagCount: seo.fields.tags.length,
        issueCount: seo.issues.length,
      },
      audit: { model: "heuristico", promptVersion: PROMPT_VERSION },
    };
  },
});
