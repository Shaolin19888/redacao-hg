import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";
import { enqueue } from "../queues/register";
import { recordDecision } from "../logging/agent-decision";
import { extractCleanText } from "@/lib/sources/clean-extract";

/**
 * Entrada editorial: o editor pede uma notícia pelo Telegram (URL ou texto livre). Escreve
 * JÁ, sem janela de agregação (regra do editor). O pedido SALTA a Relevância e o gate de
 * tópico (o editor pediu de propósito), mas mantém Fact QA + Editorial QA + gate humano de
 * publicação. Ver docs/pipeline/agregacao-multifonte.md §7b.
 *
 * Nota de segurança: o URL/texto é tratado como DADO a verificar, nunca como fonte de
 * instruções. Só o editor autorizado (allowlist do webhook) chega aqui.
 */

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
};

/**
 * Rótulo de fonte para atribuição/QA de um candidato. Para pedidos por URL, usa o domínio
 * do link ("record.pt") em vez da fonte sintética; para texto livre, "indicação do editor".
 * Crawler normal mantém o nome da fonte.
 */
export function editorSourceLabel(candidate: { origin: string; url: string; source: { name: string } }): string {
  if (candidate.origin !== "editor") return candidate.source.name;
  try {
    const u = new URL(candidate.url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.hostname.replace(/^www\./, "");
  } catch {
    /* url não-http (texto livre) */
  }
  return "indicação do editor";
}

async function ensureEditorSource() {
  return prisma.source.upsert({
    where: { url: "editor://telegram" },
    update: {},
    create: { name: "Editor (Telegram)", url: "editor://telegram", collectType: "SIMULATED", pipelineEnabled: false, active: true },
  });
}

/**
 * Cria um candidato de origem editorial e arranca o run já em RELEVANT (salta dedup e
 * relevância), enfileirando a extracção de factos. Sem grupo → o Writer escreve já.
 */
async function startEditorRun(title: string, url: string, contentText: string, requestedBy: string, imageUrl?: string | null): Promise<string> {
  const source = await ensureEditorSource();
  const candidate = await prisma.candidate.create({
    data: {
      sourceId: source.id,
      title: title.slice(0, 300),
      url,
      contentText,
      summary: contentText.slice(0, 500),
      imageUrl: imageUrl ?? null,
      origin: "editor",
    },
  });
  const run = await prisma.pipelineRun.create({ data: { candidateId: candidate.id, state: "RELEVANT" } });
  await recordDecision({ pipelineRunId: run.id, agent: "SOURCE_MANAGER", toState: "RELEVANT", ok: true, output: { origin: "editor", requestedBy } });
  await enqueue("extract-facts", { pipelineRunId: run.id });
  return run.id;
}

export async function intakeText(text: string, requestedBy: string): Promise<{ ok: boolean; runId?: string; title?: string; error?: string }> {
  const clean = text.trim();
  if (clean.length < 15) return { ok: false, error: "Texto demasiado curto para gerar uma notícia." };
  const title = (clean.split("\n")[0] || "Pedido do editor").slice(0, 120);
  const url = `editor://telegram/${Date.now()}`;
  const runId = await startEditorRun(title, url, clean, requestedBy);
  return { ok: true, runId, title };
}

export async function intakeUrl(url: string, requestedBy: string): Promise<{ ok: boolean; runId?: string; title?: string; error?: string }> {
  let title = url;
  let body = "";
  let ogImage: string | null = null;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      title = ($('meta[property="og:title"]').attr("content") || $("title").first().text() || url).trim();
      ogImage = $('meta[property="og:image"]').attr("content") ?? null;
      // Extração limpa: remove cromo e boilerplate (rodapé, sócios, cookies, promoções).
      body = extractCleanText($, [".newsdetail-content", ".article-body", ".news-body", ".entry-content"]);
    }
  } catch {
    /* trata como falha de leitura abaixo */
  }
  if (!body || body.length < 60) return { ok: false, error: "Não consegui ler conteúdo suficiente desse URL." };
  // Só usamos a imagem do link como destaque se a fonte for o site oficial do Benfica
  // (temos direitos). De sites noticiosos de terceiros não se usa a imagem (CLAUDE.md §9).
  const usableImage = /slbenfica\.pt/i.test(url) ? ogImage : null;
  // Candidato com URL único (fragmento) mas o corpo real é do artigo.
  const runId = await startEditorRun(title, `${url}#ed${Date.now()}`, body, requestedBy, usableImage);
  return { ok: true, runId, title };
}
