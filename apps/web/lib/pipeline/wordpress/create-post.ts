import { prisma } from "@/lib/prisma";
import { createDraft, searchPosts } from "@/lib/wordpress/posts";
import { uploadMediaFromUrl } from "@/lib/wordpress/media";
import { linkableTerms, insertInternalLinks, type LinkTarget } from "../seo/internal-links";

/**
 * Cria o post no WordPress a partir do artigo FINAL (já revisto/editado). É chamado só na
 * PUBLICAÇÃO (depois da aprovação humana), para não deixar rascunhos no site antes de o
 * editor ver e editar o texto, nem gastar recursos à toa. Monta categorias, imagem destacada,
 * links internos, SEO e meta. Devolve o post criado (rascunho). Ver CLAUDE.md §17.
 */

const MODALITY_RE =
  /\b(voleibol|v[óo]lei|andebol|basquetebol|basquete|futsal|h[óo]quei|patinagem|nata[çc][ãa]o|atletismo|t[ée]nis de mesa|ciclismo|r[íi]guebi|rugby|gin[áa]stica|judo|karat[ée]|boxe|polo aqu[áa]tico|xadrez|esgrima|remo|canoagem)\b/i;

export interface CreatedWpPost {
  wpPostId: number;
  link: string;
  status: string;
}

/** Constrói o corpo com links internos (mín. 4) para posts relacionados do site. */
async function withInternalLinks(title: string, body: string): Promise<string> {
  try {
    const targets: LinkTarget[] = [];
    const usedUrls = new Set<string>();
    for (const term of linkableTerms(title, body)) {
      if (targets.length >= 6) break;
      const results = await searchPosts(term, 3);
      const best = results.find((r) => !usedUrls.has(r.link));
      if (best) {
        targets.push({ term, url: best.link });
        usedUrls.add(best.link);
      }
    }
    const linked = insertInternalLinks(body, targets);
    return linked.count > 0 ? linked.body : body;
  } catch {
    return body;
  }
}

/** Cria o rascunho no WordPress para um run (usado na publicação, com o texto final). */
export async function createWpDraftForRun(pipelineRunId: string): Promise<CreatedWpPost> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { article: true, image: true },
  });
  if (!run?.article) throw new Error("Criação WP sem artigo");
  const a = run.article;

  // Categorias: sempre "Top" (§15) + secção (Modalidades se não for futebol) + específica.
  const section = MODALITY_RE.test(`${a.title} ${a.body}`) ? "Modalidades" : "Futebol";
  const categoryNames = Array.from(new Set(["Top", section, a.category ?? "Benfica"]));

  // Imagem destacada. Se a imagem já foi carregada para a media do WP (ex.: sugestão do
  // editor no Telegram, que a carrega logo), reutiliza esse wpMediaId — não depende do link
  // efémero do Telegram. Senão, faz o upload agora (só reais; o marcador simulado não vai ao site).
  const img = run.image;
  let featuredMediaId: number | null = img?.wpMediaId ?? null;
  if (!featuredMediaId && img?.url && img.source !== "simulado" && !img.url.includes("placehold.co")) {
    const media = await uploadMediaFromUrl(img.url, a.slug || a.title, img.alt ?? a.title);
    featuredMediaId = media?.id ?? null;
  }

  const content = await withInternalLinks(a.title, a.body);

  const post = await createDraft({
    title: a.title,
    content,
    excerpt: a.metaDescription ?? a.lead ?? "",
    slug: a.slug ?? "",
    subtitulo: a.lead ?? undefined,
    categoryNames,
    tagNames: a.tags ?? [],
    metaTitle: a.title, // título SEO completo (Yoast)
    metaDescription: a.metaDescription ?? undefined,
    featuredMediaId,
    status: "draft", // cria sempre como rascunho; a publicação muda o estado a seguir
  });

  return { wpPostId: post.id, link: post.link, status: post.status };
}
