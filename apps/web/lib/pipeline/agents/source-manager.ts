import { prisma } from "@/lib/prisma";
import type { CollectType } from "@prisma/client";
import { simhash } from "../dedup/simhash";
import { startRun } from "../orchestrator/orchestrator";
import { fetchRss } from "@/lib/sources/rss-fetcher";
import { crawlSource } from "@/lib/sources/crawler";
import { crawlSlBenfica } from "@/lib/sources/slbenfica-crawler";
import { extractArticleContent } from "@/lib/sources/article-extractor";
import { isOfficialBenficaSource } from "../dedup/decide";
import { ignorarNaEntrada } from "../intake/video-pages";
import type { FetchedItem } from "@/lib/sources/types";

/**
 * Source Manager — verifica fontes activas e recolhe candidatos.
 * Fase 1: suporta recolha SIMULADA (para exercitar o pipeline sem rede nem publicação).
 * Adaptadores reais (RSS/CRAWLER) ligam-se nesta mesma função em fases seguintes,
 * reutilizando lib/sources/* (regra 12: sem duplicar adaptadores por fonte).
 */

export interface RawCandidate {
  title: string;
  url: string;
  summary?: string;
  contentText?: string;
  imageUrl?: string;
  publishedAt?: Date | null;
}

export interface CollectionResult {
  sourceId: string;
  collected: number;
  created: number;
  skippedExisting: number;
  /** Páginas de vídeo/directo ignoradas à entrada (não custam triagem). */
  skippedVideo: number;
  runsStarted: number;
  error: string | null;
}

/** Garante que existe uma fonte de simulação para o pipeline. */
export async function ensureSimulatedSource() {
  const url = "simulacao://pipeline";
  return prisma.source.upsert({
    where: { url },
    update: {},
    create: {
      name: "Simulação (pipeline)",
      url,
      active: true,
      pipelineEnabled: true,
      collectType: "SIMULATED",
      categories: ["Benfica", "Sporting", "FC Porto", "Liga Portugal"],
      frequencyMinutes: 0,
    },
  });
}

/**
 * Conjunto simulado desenhado para demonstrar o Duplicate Detector:
 *  - A: notícia canónica
 *  - B: repost quase-verbatim de A (deve ser ARQUIVADO como duplicado)
 *  - C: paráfrase de outra fonte, mesmo tema (deve SOBREVIVER — é história relacionada)
 *  - D, E: notícias distintas (únicas)
 * URLs únicos por execução para permitir correr a demo repetidamente.
 */
export function generateSimulatedCandidates(stamp: number = Date.now()): RawCandidate[] {
  const s = stamp.toString(36);
  return [
    {
      title: "Benfica prepara proposta pelo médio argentino Nicolás Ramírez do River Plate",
      url: `simulacao://benfica-ramirez-a-${s}`,
      summary: "O Benfica segue de perto o médio de 22 anos e prepara uma proposta nas próximas semanas.",
      contentText:
        "O Benfica prepara uma proposta pelo médio argentino Nicolás Ramírez, de 22 anos, que representa o River Plate. A direcção encarnada segue o jogador há vários meses e acredita ter margem para avançar nas próximas semanas.",
      publishedAt: new Date(),
    },
    {
      // Repost quase-verbatim de A (pontuação/ligeira alteração) → duplicado.
      title: "Benfica prepara proposta pelo médio argentino Nicolás Ramírez, do River Plate",
      url: `simulacao://benfica-ramirez-b-${s}`,
      summary: "O Benfica segue de perto o médio de 22 anos e prepara uma proposta nas próximas semanas.",
      contentText:
        "O Benfica prepara uma proposta pelo médio argentino Nicolás Ramírez, de 22 anos, que representa o River Plate. A direcção encarnada segue o jogador há vários meses e acredita ter margem para avançar nas próximas semanas.",
      publishedAt: new Date(),
    },
    {
      // Paráfrase de outra fonte, mesmo tema → NÃO é duplicado (agrupar depois).
      title: "Encarnados avançam por Ramírez, jovem médio do River Plate",
      url: `simulacao://encarnados-ramirez-c-${s}`,
      summary: "Segundo a imprensa argentina, o clube da Luz quer reforçar o meio-campo com o internacional sub-23.",
      contentText:
        "O clube da Luz quer reforçar o meio-campo e colocou as atenções em Ramírez, internacional sub-23 pela Argentina. A imprensa local dá conta de contactos entre as partes.",
      publishedAt: new Date(),
    },
    {
      title: "Sporting empata com o Braga a uma bola em Alvalade na nona jornada da Liga",
      url: `simulacao://sporting-braga-d-${s}`,
      summary: "Os leões cederam o empate já na segunda parte, num jogo equilibrado em Alvalade.",
      contentText:
        "O Sporting empatou a uma bola frente ao Braga em Alvalade, em jogo a contar para a nona jornada da Liga. Os leões marcaram primeiro mas permitiram o empate na segunda parte.",
      publishedAt: new Date(),
    },
    {
      title: "FC Porto anuncia renovação do guarda-redes até 2029",
      url: `simulacao://porto-renovacao-e-${s}`,
      summary: "O internacional assinou novo vínculo com os dragões por mais quatro épocas.",
      contentText:
        "O FC Porto oficializou a renovação de contrato do seu guarda-redes até 2029. O internacional prolongou o vínculo por mais quatro temporadas, reforçando a aposta na baliza.",
      publishedAt: new Date(),
    },
  ];
}

/** Recolhe candidatos de uma fonte, cria Candidates e arranca um run por candidato novo. */
export async function collectFromSource(sourceId: string): Promise<CollectionResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return { sourceId, collected: 0, created: 0, skippedExisting: 0, skippedVideo: 0, runsStarted: 0, error: "Fonte não encontrada" };
  if (!source.active) return { sourceId, collected: 0, created: 0, skippedExisting: 0, skippedVideo: 0, runsStarted: 0, error: "Fonte inactiva" };

  let raw: RawCandidate[];
  try {
    raw = await collectRaw(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.source.update({ where: { id: sourceId }, data: { lastError: msg } });
    return { sourceId, collected: 0, created: 0, skippedExisting: 0, skippedVideo: 0, runsStarted: 0, error: msg };
  }

  let created = 0;
  let skippedExisting = 0;
  let runsStarted = 0;
  let skippedVideo = 0;

  // Páginas de vídeo/directo: não têm texto para extrair factos, e cada uma custa uma
  // chamada de triagem. Ligado por omissão; desliga-se em `pipeline_skip_video_pages`.
  const skipVideoSetting = await prisma.setting.findUnique({ where: { key: "pipeline_skip_video_pages" } });
  const skipVideo = (skipVideoSetting?.value ?? "true") === "true";

  // Criar TODOS os candidatos primeiro (assegura que o dedup vê os anteriores),
  // e só depois arrancar os runs, pela ordem de recolha.
  const newCandidateIds: string[] = [];
  for (const item of raw) {
    if (!item.title?.trim() || !item.url?.trim()) continue;
    if (skipVideo && ignorarNaEntrada(item.url, item.title)) { skippedVideo++; continue; }
    const existing = await prisma.candidate.findUnique({ where: { url: item.url }, select: { id: true } });
    if (existing) { skippedExisting++; continue; }

    const sig = simhash([item.title, item.summary ?? "", item.contentText ?? ""].join(" "));
    const candidate = await prisma.candidate.create({
      data: {
        sourceId,
        title: item.title.trim(),
        url: item.url.trim(),
        summary: item.summary ?? null,
        contentText: item.contentText ?? null,
        imageUrl: item.imageUrl ?? null,
        publishedAt: item.publishedAt ?? null,
        simhash: sig,
      },
      select: { id: true },
    });
    created++;
    newCandidateIds.push(candidate.id);
  }

  for (const id of newCandidateIds) {
    await startRun(id);
    runsStarted++;
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastPipelineRun: new Date(), lastError: null },
  });

  await prisma.log.create({
    data: {
      action: "pipeline_collect",
      details: `${source.name}: ${created} candidatos novos, ${skippedExisting} já existentes, ${runsStarted} runs iniciados`,
    },
  });

  return { sourceId, collected: raw.length, created, skippedExisting, skippedVideo, runsStarted, error: null };
}

/** Máximo de candidatos a processar por recolha (controlo de custo/volume). */
const MAX_CANDIDATES_PER_COLLECT = Number(process.env.PIPELINE_MAX_CANDIDATES ?? 8);
/**
 * Buscar o corpo completo de cada artigo (opt-in). Por defeito usa-se o resumo do RSS,
 * que o publisher fornece para sindicação: mais robusto (sem 8 fetches ao site por recolha),
 * mais rápido e mais seguro em direitos de autor. Liga com PIPELINE_FETCH_FULLTEXT=true.
 */
const FETCH_FULLTEXT = process.env.PIPELINE_FETCH_FULLTEXT === "true";

/** Executa uma função assíncrona com uma re-tentativa (para fetches transitoriamente instáveis). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

async function collectRaw(source: { id: string; collectType: CollectType; url: string; rssUrl: string | null }): Promise<RawCandidate[]> {
  if (source.collectType === "SIMULATED") return generateSimulatedCandidates();

  // Recolha real: reutiliza os adaptadores de lib/sources/* (regra 12: sem duplicar).
  let items: FetchedItem[];
  if (source.url.includes("slbenfica.pt")) {
    items = await withRetry(() => crawlSlBenfica());
  } else if (source.collectType === "RSS" && source.rssUrl) {
    items = await withRetry(() => fetchRss(source.rssUrl!));
  } else {
    items = await withRetry(() => crawlSource(source.url));
  }

  // Só os mais recentes, para controlar volume e custo de LLM.
  items = items.slice(0, MAX_CANDIDATES_PER_COLLECT);

  return Promise.all(
    items.map(async (it): Promise<RawCandidate> => {
      // Corpo para extracção de factos + detecção de cópia. Guardado internamente,
      // NUNCA publicado — o Writer só vê factos, não o corpo.
      let contentText = it.fullBody ?? null;
      if (!contentText && FETCH_FULLTEXT && it.url) {
        contentText = await extractArticleContent(it.url).catch(() => null);
      }
      return {
        title: it.title,
        url: it.url,
        summary: it.summary ?? undefined,
        contentText: contentText ?? it.summary ?? undefined,
        imageUrl: it.imageUrl ?? undefined,
        publishedAt: it.publishedAt,
      };
    })
  );
}

/** Corre a recolha simulada: garante a fonte de simulação e recolhe. */
export async function runSimulatedCollection(): Promise<CollectionResult> {
  const source = await ensureSimulatedSource();
  return collectFromSource(source.id);
}

export interface CollectAllResult {
  results: CollectionResult[];
  skipped: string[]; // fontes ainda dentro da própria cadência (não recolhidas)
}

/**
 * Recolha automática de TODAS as fontes reais do pipeline (exclui a fonte SIMULATED).
 * Respeita a cadência de cada fonte (frequencyMinutes vs lastPipelineRun) para não
 * recolher a mesma fonte mais vezes do que o configurado, controlando custo e volume.
 * Erros de uma fonte não interrompem as outras (collectFromSource captura e devolve).
 */
export async function collectAllPipelineSources(): Promise<CollectAllResult> {
  const sources = await prisma.source.findMany({
    where: { active: true, pipelineEnabled: true, collectType: { not: "SIMULATED" } },
    orderBy: { name: "asc" },
  });

  // Prioridade editorial: recolher o site oficial do Benfica PRIMEIRO, para que a sua
  // versão fique canónica e as notícias iguais das outras fontes sejam arquivadas contra
  // ela (regra do editor: o oficial tem sempre prioridade).
  sources.sort((a, b) => Number(isOfficialBenficaSource(b.url)) - Number(isOfficialBenficaSource(a.url)));

  const now = Date.now();
  const results: CollectionResult[] = [];
  const skipped: string[] = [];

  for (const s of sources) {
    const freqMs = Math.max(1, s.frequencyMinutes) * 60_000;
    // Tolerância de 60s para não saltar um ciclo por jitter quando o tick do cron
    // coincide com a cadência da fonte (ex.: 30 min de tick e 30 min de frequência).
    const due = !s.lastPipelineRun || now - s.lastPipelineRun.getTime() >= freqMs - 60_000;
    if (!due) {
      skipped.push(s.name);
      continue;
    }
    results.push(await collectFromSource(s.id));
  }

  return { results, skipped };
}
