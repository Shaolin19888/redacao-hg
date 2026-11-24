import * as cheerio from "cheerio";
import type { FetchedItem } from "./types";
import { extractCleanText } from "./clean-extract";

const BASE = "https://www.slbenfica.pt";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "pt-PT,pt;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

async function extractArticleDetails(url: string): Promise<{ body: string; imageUrl: string | null }> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    // Imagem principal via og:image
    const imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

    // Corpo do artigo
    const container = $(".newsdetail-content, .generic-content-container").first();
    const paragraphs: string[] = [];
    container.find("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) paragraphs.push(text);
    });

    const body = paragraphs.join("\n\n");
    return { body, imageUrl };
  } catch {
    return { body: "", imageUrl: null };
  }
}

export async function crawlSlBenfica(): Promise<(FetchedItem & { imageUrl?: string | null })[]> {
  const html = await fetchHtml(`${BASE}/pt-pt/`);
  const $ = cheerio.load(html);

  const articlePaths = new Set<string>();
  $('a[href*="/pt-pt/agora/noticias/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.match(/\/pt-pt\/agora\/noticias\/\d{4}\/\d{2}\/\d{2}\//)) {
      articlePaths.add(href);
    }
  });

  const urls = [...articlePaths].slice(0, 15).map((p) =>
    p.startsWith("http") ? p : `${BASE}${p}`
  );

  const items: (FetchedItem & { imageUrl?: string | null })[] = [];

  for (const url of urls) {
    try {
      const articleHtml = await fetchHtml(url);
      const $ = cheerio.load(articleHtml);

      const title = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
      const description = $('meta[property="og:description"]').attr("content")?.trim() ?? null;
      const imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

      // Corpo do artigo, já limpo de cromo/boilerplate (rodapé de sócios, valores
      // mobiliários, apelos de apoio) que não fazem parte da notícia.
      const body = extractCleanText($, [".newsdetail-content"]);

      if (!title || !url) continue;

      items.push({
        title,
        url,
        publishedAt: null,
        summary: description ?? (body.slice(0, 300) || null),
        imageUrl,
        // Guardar o corpo completo no summary para usar no prompt
        ...(body ? { fullBody: body } : {}),
      } as FetchedItem & { imageUrl?: string | null; fullBody?: string });
    } catch {
      // Continuar para o próximo artigo
    }
  }

  return items;
}
