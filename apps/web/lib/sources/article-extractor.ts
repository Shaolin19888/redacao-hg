import * as cheerio from "cheerio";
import { extractCleanText } from "./clean-extract";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "pt-PT,pt;q=0.9",
};

// Selectores de conteúdo principal por domínio
const CONTENT_SELECTORS: Record<string, string[]> = {
  "record.pt": [".mainTexto .text_container", ".mainTexto", ".main_article .text_container", ".article-body", ".news-body", ".article-content"],
  "abola.pt": [".article-body", ".news-content", ".noticia-corpo", "article"],
  "ojogo.pt": [".article-body", ".article-content", "article .body"],
  "maisfutebol.iol.pt": [".article-body", ".articleBody", ".article-text", "article"],
  "bolanarede.pt": [".entry-content", ".post-content", "article .content", ".the-content"],
  "glorioso1904.pt": [".entry-content", ".post-content", "article .content"],
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

export async function extractArticleContent(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Extração limpa partilhada (remove cromo + boilerplate), com os selectores do domínio.
  const domain = getDomain(url);
  const selectors = CONTENT_SELECTORS[domain] ?? [];
  return extractCleanText($, [...selectors, ".newsdetail-content"]);
}
