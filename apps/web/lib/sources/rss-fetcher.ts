import Parser from "rss-parser";
import type { FetchedItem } from "./types";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "RedacaoHG/1.0 (editorial reader)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

function cleanText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // fragmentos CDATA mal fechados (feeds truncados)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function fetchRss(rssUrl: string): Promise<FetchedItem[]> {
  const feed = await parser.parseURL(rssUrl);

  return feed.items.slice(0, 30).map((item) => ({
    title: cleanText(item.title ?? ""),
    url: (item.link ?? item.guid ?? "").trim(),
    publishedAt: item.pubDate ? new Date(item.pubDate) : null,
    summary: item.contentSnippet
      ? cleanText(item.contentSnippet).slice(0, 500)
      : item.summary
      ? cleanText(item.summary).slice(0, 500)
      : null,
  }));
}
