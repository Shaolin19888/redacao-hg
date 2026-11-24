import * as cheerio from "cheerio";
import type { FetchedItem } from "./types";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
};

// Configurações específicas por domínio
interface CrawlerConfig {
  articleSelector: string;
  titleSelector: string;
  linkSelector: string;
  summarySelector?: string;
  // Página de listagem a recolher (relativa à raiz da fonte), quando a homepage não
  // serve (ex.: dominada por vídeos). Se ausente, recolhe a própria URL da fonte.
  listPath?: string;
  // Só aceitar URLs de artigo que casem (exclui vídeos, cronologias, menu, etc.).
  linkFilter?: RegExp;
}

const DOMAIN_CONFIGS: Record<string, CrawlerConfig> = {
  "abola.pt": {
    // Site moderno (React/Tailwind): cada <article> tem o título num <a href=".../noticias/">.
    // O 1º <a> costuma ser a imagem (sem texto), por isso o título vem do 1º anchor COM texto.
    articleSelector: "article",
    titleSelector: "a[href*='/noticias/']",
    linkSelector: "a[href*='/noticias/']",
    linkFilter: /abola\.pt\/noticias\//i,
  },
  "ojogo.pt": {
    articleSelector: "article, .article, .news-item",
    titleSelector: "h2, h3",
    linkSelector: "a",
    summarySelector: "p",
  },
  "maisfutebol.iol.pt": {
    // Markup antigo: os títulos vivem em <h2>/<h3> com o link dentro (<h2><a>…</a></h2>).
    // A homepage é dominada por vídeos, por isso recolhe-se a listagem /ultimas.
    articleSelector: "h2, h3",
    titleSelector: "a",
    linkSelector: "a",
    listPath: "/ultimas",
    linkFilter:
      /maisfutebol\.iol\.pt\/(benfica|sporting|fc-porto|futebol|liga|mundial-?2026|selecoes|internacional|modalidades|futsal|gil-vicente|braga|guimaraes|arbitragem|nacional|famalicao|casa-pia|estoril|moreirense|rio-ave|santa-clara|tondela|afs|arouca|nacional)\//i,
  },
  "bolanarede.pt": {
    articleSelector: "article, .post, .entry",
    titleSelector: "h2, h3, .entry-title",
    linkSelector: "a",
    summarySelector: "p, .entry-summary",
  },
  "glorioso1904.pt": {
    articleSelector: "article, .post, .entry",
    titleSelector: "h2, h3, .entry-title",
    linkSelector: "a",
    summarySelector: "p, .entry-summary",
  },
};

function getDomainConfig(url: string): CrawlerConfig {
  const hostname = new URL(url).hostname.replace("www.", "");
  return (
    DOMAIN_CONFIGS[hostname] ?? {
      articleSelector: "article, .article, .post, .noticia",
      titleSelector: "h2, h3",
      linkSelector: "a",
      summarySelector: "p",
    }
  );
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

export async function crawlSource(sourceUrl: string): Promise<FetchedItem[]> {
  const config = getDomainConfig(sourceUrl);
  // Se a fonte definir uma página de listagem, recolhe-se essa (não a homepage).
  const fetchUrl = config.listPath ? new URL(config.listPath, sourceUrl).href : sourceUrl;

  const res = await fetch(fetchUrl, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${fetchUrl}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const items: FetchedItem[] = [];
  const seen = new Set<string>();

  $(config.articleSelector).each((_, el) => {
    // Título: o primeiro elemento do titleSelector COM texto substancial (em sites modernos
    // o 1º anchor é a imagem, sem texto; o título vem no anchor seguinte).
    const titleCandidates = $(el).find(config.titleSelector);
    let titleEl = titleCandidates.filter((_, e) => $(e).text().trim().length >= 10).first();
    if (titleEl.length === 0) titleEl = titleCandidates.first();
    const title = titleEl.text().trim().replace(/\s+/g, " ");
    if (!title || title.length < 10) return;

    const linkEl = $(el).find(config.linkSelector).first();
    const href = titleEl.attr("href") ?? linkEl.attr("href") ?? titleEl.closest("a").attr("href") ?? "";
    const url = resolveUrl(href, fetchUrl);
    if (!url || seen.has(url)) return;
    if (config.linkFilter && !config.linkFilter.test(url)) return;

    const summary = config.summarySelector
      ? $(el).find(config.summarySelector).first().text().trim().slice(0, 500) || null
      : null;

    seen.add(url);
    items.push({ title, url, publishedAt: null, summary });
  });

  return items.slice(0, 30);
}
