import OpenAI from "openai";
import { SYSTEM_PROMPT, buildNewsPrompt } from "./prompts";
import type { GeneratedContent, GenerateRequest } from "./types";
import { prisma } from "@/lib/prisma";
import { extractArticleContent } from "@/lib/sources/article-extractor";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateContent(req: GenerateRequest): Promise<GeneratedContent> {
  const modelo = process.env.OPENAI_MODEL_TEXT ?? "gpt-4o";
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

  // Carregar URL extra se fornecido
  if (req.urlExtra) {
    try {
      const extra = await extractArticleContent(req.urlExtra);
      conteudoCompleto = conteudoCompleto
        ? `${conteudoCompleto}\n\n--- URL extra ---\n${extra}`
        : extra;
      if (!url) url = req.urlExtra;
      if (!fonte) fonte = new URL(req.urlExtra).hostname;
    } catch {
      // ignora falha no URL extra
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

  const response = await openai.chat.completions.create({
    model: modelo,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Resposta vazia do modelo");

  const parsed = JSON.parse(raw) as GeneratedContent;
  parsed.modelo = modelo;

  // Guardar na base de dados (só se houver newsItem)
  if (newsItemDbId) await prisma.generatedText.create({
    data: {
      newsItemId: newsItemDbId,
      modelo,
      formato,
      tom,
      instrucoes: req.instrucoes ?? null,
      conteudo: raw,
      status: "gerado",
    },
  });

  if (newsItemDbId) {
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
