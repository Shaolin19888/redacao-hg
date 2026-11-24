import { prisma } from "@/lib/prisma";
import { fetchRss } from "./rss-fetcher";
import { crawlSource } from "./crawler";
import { crawlSlBenfica } from "./slbenfica-crawler";
import { autoRewriteItem } from "@/lib/editorial/auto-rewrite";
import type { FetchResult } from "./types";

export async function fetchSource(sourceId: string): Promise<FetchResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return { sourceId, items: [], error: "Fonte não encontrada" };
  if (!source.active) return { sourceId, items: [], error: "Fonte inactiva" };

  try {
    const items = source.url.includes("slbenfica.pt")
      ? await crawlSlBenfica()
      : source.rssUrl
      ? await fetchRss(source.rssUrl)
      : await crawlSource(source.url);

    // URLs que o utilizador já rejeitou — nunca voltar a guardar
    const urls = items.map((i) => i.url).filter(Boolean) as string[];
    const ignoredSet = new Set(
      urls.length > 0
        ? (await prisma.ignoredUrl.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((r) => r.url)
        : []
    );

    let saved = 0;
    const newIds: string[] = [];

    for (const item of items) {
      if (!item.title || !item.url) continue;
      if (ignoredSet.has(item.url)) continue;
      try {
        const record = await prisma.newsItem.upsert({
          where: { url: item.url },
          update: {},
          create: {
            title: item.title,
            url: item.url,
            sourceId: source.id,
            publishedAt: item.publishedAt,
            summary: item.summary,
            imageUrl: item.imageUrl ?? null,
            status: "nova",
          },
          select: { id: true, status: true },
        });
        // Só processa auto-publish em itens recém-criados (status "nova")
        if (record.status === "nova") {
          newIds.push(record.id);
          saved++;
        }
      } catch {
        // URL duplicada noutras fontes — ignorar
      }
    }

    await prisma.source.update({
      where: { id: sourceId },
      data: { lastFetched: new Date() },
    });

    await prisma.log.create({
      data: {
        action: "source_fetch",
        details: `${source.name}: ${saved} notícias guardadas de ${items.length} encontradas`,
      },
    });

    // Auto-reescrita legacy (cria rascunhos WP). Fica atrás de um kill-switch: quando o
    // pipeline editorial assumir a criação de rascunhos (Fase 3), desligar definindo o
    // Setting `legacy_autorewrite_enabled` = "false". Ver docs/pipeline/arquitetura.md §10.
    const legacyFlag = await prisma.setting.findUnique({ where: { key: "legacy_autorewrite_enabled" } });
    const legacyEnabled = (legacyFlag?.value ?? "true") === "true";
    if (legacyEnabled && source.autoPublish && newIds.length > 0) {
      const model = (source.autoModel === "claude" ? "claude" : "openai") as "openai" | "claude";
      for (const id of newIds) {
        autoRewriteItem(id, model).catch(() => {}); // fire-and-forget
      }
    }

    return { sourceId, items, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.log.create({
      data: { action: "source_fetch", details: `Erro em ${source.name}: ${msg}` },
    });
    return { sourceId, items: [], error: msg };
  }
}

export async function fetchAllSources(): Promise<FetchResult[]> {
  const sources = await prisma.source.findMany({ where: { active: true } });
  return Promise.all(sources.map((s) => fetchSource(s.id)));
}
