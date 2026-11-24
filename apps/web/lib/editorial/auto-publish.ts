import { prisma } from "@/lib/prisma";
import { createDraft } from "@/lib/wordpress/posts";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadImageToWP(imageUrl: string): Promise<number | null> {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USER;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;
  if (!wpUrl || !wpUser || !wpPass) return null;

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
    const filename = `slbenfica-${Date.now()}.${ext}`;

    const token = Buffer.from(`${wpUser}:${wpPass}`).toString("base64");
    const res = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType,
      },
      body: buffer,
    });

    if (!res.ok) return null;
    const data = await res.json() as { id: number };
    return data.id;
  } catch {
    return null;
  }
}

async function rewriteWithChatGPT(title: string, body: string, url: string): Promise<{
  titulo: string;
  texto: string;
  slug: string;
  metaDescricao: string;
  categorias: string[];
  tags: string[];
} | null> {
  const prompt = `Tens de reescrever esta notícia do site oficial do Benfica (${url}) para o site HugoGil.pt.

Título original: ${title}

Conteúdo original:
${body || "(sem corpo disponível — usa o título para criar uma notícia breve)"}

Regras obrigatórias:
- Escreve em português europeu
- Não copies frases do original — reescreve com linguagem editorial própria
- Mantém todos os factos e dados
- Cria um título jornalístico com impacto
- Texto entre 150 e 400 palavras, adequado ao tema
- Gera um slug em português sem acentos

Devolve JSON com este formato exacto:
{
  "titulo": "...",
  "texto": "...",
  "slug": "...",
  "metaDescricao": "...",
  "categorias": ["Benfica"],
  "tags": ["Benfica"]
}`;

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_TEXT ?? "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as {
      titulo: string; texto: string; slug: string;
      metaDescricao: string; categorias: string[]; tags: string[];
    };
  } catch {
    return null;
  }
}

export async function autoPublishItem(newsItemId: string): Promise<{ ok: boolean; wpId?: number; error?: string }> {
  const item = await prisma.newsItem.findUnique({
    where: { id: newsItemId },
    select: { id: true, title: true, url: true, summary: true, imageUrl: true, status: true },
  });

  if (!item) return { ok: false, error: "Item não encontrado" };
  if (item.status === "publicada") return { ok: false, error: "Já publicado" };

  await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "aguardando_texto" } });

  // Reescrever com ChatGPT
  const content = await rewriteWithChatGPT(item.title, item.summary ?? "", item.url);
  if (!content) {
    await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "com_erro" } });
    return { ok: false, error: "Falha ao gerar texto com ChatGPT" };
  }

  // Carregar imagem para WordPress
  let featuredMediaId: number | null = null;
  if (item.imageUrl) {
    featuredMediaId = await uploadImageToWP(item.imageUrl);
  }

  // Publicar no WordPress
  try {
    const post = await createDraft({
      title: content.titulo,
      content: content.texto,
      excerpt: content.metaDescricao,
      slug: content.slug,
      categoryNames: content.categorias ?? ["Benfica"],
      tagNames: content.tags ?? ["Benfica"],
      metaDescription: content.metaDescricao,
      featuredMediaId,
      status: "publish",
    });

    await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "publicada" } });

    await prisma.log.create({
      data: {
        action: "auto_publish",
        details: `SL Benfica: "${content.titulo}" publicado (WP ID ${post.id}) — fonte: ${item.url}`,
      },
    });

    return { ok: true, wpId: post.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.newsItem.update({ where: { id: newsItemId }, data: { status: "com_erro" } });
    await prisma.log.create({
      data: { action: "auto_publish_error", details: `Erro ao publicar "${item.title}": ${msg}` },
    });
    return { ok: false, error: msg };
  }
}
