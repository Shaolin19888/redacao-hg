import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = (title: string, body: string, url: string) => `
Reescreve esta notícia do site oficial do Benfica (${url}) para o site HugoGil.pt.

Título original: ${title}

Conteúdo original:
${body || "(sem corpo disponível — usa o título para criar uma notícia breve)"}

Regras obrigatórias:
- Escreve em português europeu, nunca brasileiro
- Não copies frases do original — reescreve com linguagem editorial própria
- Mantém todos os factos e dados
- Cria um título jornalístico com impacto
- Texto entre 150 e 400 palavras conforme o tema
- Gera slug em português sem acentos

Devolve JSON com este formato exacto:
{
  "tituloPrincipal": "...",
  "texto": "...",
  "slug": "...",
  "metaDescricao": "...",
  "categoriasSugeridas": ["Benfica"],
  "tagsSugeridas": ["Benfica"],
  "notaRiscoEditorial": "Sem risco assinalado"
}
`.trim();

async function rewriteOpenAI(title: string, body: string, url: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL_TEXT ?? "gpt-4o",
    messages: [{ role: "user", content: PROMPT(title, body, url) }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });
  return res.choices[0]?.message?.content ?? "{}";
}

async function rewriteClaude(title: string, body: string, url: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL_TEXT ?? "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: PROMPT(title, body, url) }],
  });
  const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
}

export async function autoRewriteItem(newsItemId: string, model: "openai" | "claude"): Promise<void> {
  const item = await prisma.newsItem.findUnique({
    where: { id: newsItemId },
    select: { id: true, title: true, url: true, summary: true, status: true },
  });

  if (!item || item.status !== "nova") return;

  await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "aguardando_texto" } });

  try {
    const raw = model === "claude"
      ? await rewriteClaude(item.title, item.summary ?? "", item.url)
      : await rewriteOpenAI(item.title, item.summary ?? "", item.url);

    JSON.parse(raw); // validar JSON

    await prisma.generatedText.create({
      data: {
        newsItemId,
        modelo: model === "claude" ? "claude-sonnet-4-6" : (process.env.OPENAI_MODEL_TEXT ?? "gpt-4o"),
        formato: "noticia",
        tom: "informativo",
        conteudo: raw,
      },
    });

    await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "texto_gerado" } });

    await prisma.log.create({
      data: {
        action: "auto_rewrite",
        details: `"${item.title}" reescrito com ${model} — aguarda aprovação`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "nova" } });
    await prisma.log.create({
      data: { action: "auto_rewrite_error", details: `Erro ao reescrever "${item.title}": ${msg}` },
    });
  }
}
