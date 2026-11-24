import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildNewsPrompt } from "./prompts";
import type { GeneratedContent, GenerateRequest } from "./types";
import { prisma } from "@/lib/prisma";
import { extractArticleContent } from "@/lib/sources/article-extractor";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateContentClaude(req: GenerateRequest): Promise<GeneratedContent> {
  const modelo = process.env.ANTHROPIC_MODEL_TEXT ?? "claude-sonnet-4-6";
  const formato = req.formato ?? "noticia";
  const tom = req.tom ?? "informativo";

  let titulo: string | undefined;
  let fonte: string | undefined;
  let url: string | undefined;
  let resumo: string | null = null;
  let conteudoCompleto: string | null = null;
  let newsItemDbId: string | undefined;

  if (req.newsItemId) {
    const newsItem = await prisma.newsItem.findUnique({
      where: { id: req.newsItemId },
      include: { source: true },
    });
    if (!newsItem) throw new Error("Notícia não encontrada");
    titulo = newsItem.title;
    fonte = newsItem.source.name;
    url = newsItem.url;
    resumo = newsItem.summary;
    newsItemDbId = newsItem.id;
    try {
      conteudoCompleto = await extractArticleContent(newsItem.url);
    } catch {
      // usa resumo
    }
  }

  if (req.urlExtra) {
    try {
      const extra = await extractArticleContent(req.urlExtra);
      conteudoCompleto = conteudoCompleto
        ? `${conteudoCompleto}\n\n--- URL extra ---\n${extra}`
        : extra;
      if (!url) url = req.urlExtra;
      if (!fonte) fonte = new URL(req.urlExtra).hostname;
    } catch {
      // ignora
    }
  }

  const userPrompt = buildNewsPrompt({
    titulo,
    fonte,
    url,
    resumo,
    conteudoCompleto,
    textoLivre: req.textoLivre,
    urlExtra: req.urlExtra,
    instrucoes: req.instrucoes ?? "",
    formato,
    tom,
    percentagemIA: req.percentagemIA,
  });

  const message = await anthropic.messages.create({
    model: modelo,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : null;
  if (!raw) throw new Error("Resposta vazia do modelo");

  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;
  const parsed = JSON.parse(jsonStr.trim()) as GeneratedContent;
  parsed.modelo = modelo;

  if (newsItemDbId) {
    await prisma.generatedText.create({
      data: {
        newsItemId: newsItemDbId,
        modelo,
        formato,
        tom,
        instrucoes: req.instrucoes ?? null,
        conteudo: jsonStr.trim(),
        status: "gerado",
      },
    });
    await prisma.newsItem.update({
      where: { id: newsItemDbId },
      data: { status: "texto_gerado" },
    });
  }

  await prisma.log.create({
    data: {
      action: "text_generate",
      details: `Texto gerado para "${titulo ?? req.urlExtra ?? "texto livre"}" com ${modelo}`,
    },
  });

  return parsed;
}
