import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { buildImageQuery, simulatedImage, searchOpenverse, officialImage, isOwnedImageDomain } from "../image/search";

/**
 * Image Research Agent — procura uma imagem destacada adequada (só pesquisa real, sem
 * geração). Modo simulado por defeito (Setting `pipeline_images_mode`): marcador local
 * sem rede. Modo real: pesquisa Creative Commons (Openverse). Cria um ImageAsset e o alt
 * text a partir do artigo. SEO_QA_OK → IMAGE_READY.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({
  source: z.string(),
  hasImage: z.boolean(),
  query: z.string(),
});

async function resolveImageMode(): Promise<"real" | "simulado"> {
  const setting = await prisma.setting.findUnique({ where: { key: "pipeline_images_mode" } });
  return setting?.value === "real" ? "real" : "simulado";
}

export const imageResearchAgent = defineAgent({
  name: "IMAGE_RESEARCH",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: { article: true, candidate: { include: { source: true } } },
    });
    if (!run?.article) throw new Error("Image Research sem artigo");

    const query = buildImageQuery(run.article.category, run.article.tags, run.article.title);
    const mode = await resolveImageMode();

    // Prioridade: se o candidato vem de um site cujos direitos o editor detém (site oficial
    // do Benfica), usa-se a própria imagem do artigo (autorizada) em vez de pesquisar. Vale
    // para a recolha (source.url = slbenfica) e para pedidos do editor por link do slbenfica
    // (a própria url do candidato é oficial).
    const candImage = run.candidate?.imageUrl;
    const ownedBySource = isOwnedImageDomain(run.candidate?.source?.url);
    const ownedByUrl = run.candidate?.origin === "editor" && isOwnedImageDomain(run.candidate?.url);
    let found: ReturnType<typeof simulatedImage> | Awaited<ReturnType<typeof searchOpenverse>>;
    if (candImage && (ownedBySource || ownedByUrl)) {
      found = officialImage(candImage, ownedByUrl ? "SL Benfica" : run.candidate!.source.name);
    } else {
      found = mode === "real" ? await searchOpenverse(query) : simulatedImage(query);
      // Se a pesquisa real não devolver nada, cai para o marcador (o QA/humano decide depois).
      if (!found) found = simulatedImage(query);
    }

    const alt = `${run.article.title}`.slice(0, 120);

    await prisma.imageAsset.upsert({
      where: { pipelineRunId: input.pipelineRunId },
      update: {
        source: found.source, url: found.url, alt,
        width: found.width, height: found.height, bytes: found.bytes,
        format: found.format, license: found.license, attribution: found.attribution,
        isSynthetic: false, qaStatus: "pending",
      },
      create: {
        pipelineRunId: input.pipelineRunId,
        source: found.source, url: found.url, alt,
        width: found.width, height: found.height, bytes: found.bytes,
        format: found.format, license: found.license, attribution: found.attribution,
        isSynthetic: false,
      },
    });

    return {
      nextState: "IMAGE_READY" as const,
      output: { source: found.source, hasImage: true, query },
      audit: { model: mode === "real" ? "openverse" : "simulado", promptVersion: PROMPT_VERSION },
    };
  },
});
