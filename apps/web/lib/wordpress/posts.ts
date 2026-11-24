import { wpFetch } from "./client";

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WpTag {
  id: number;
  name: string;
  slug: string;
}

export interface WpDraftInput {
  title: string;
  subtitulo?: string;
  content: string;
  excerpt: string;
  slug: string;
  categoryNames: string[];
  tagNames: string[];
  metaTitle?: string;
  metaDescription?: string;
  pushTitle?: string;
  pushBody?: string;
  onesignalTitle?: string;
  featuredMediaId?: number | null;
  status?: "draft" | "publish";
}

export interface WpPost {
  id: number;
  link: string;
  status: string;
  title: { rendered: string };
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function findOrCreateTaxonomy(
  endpoint: string,
  name: string
): Promise<number> {
  // Primeiro tenta encontrar pelo nome exacto
  const existing = await wpFetch<Array<{ id: number; name: string }>>(
    `${endpoint}?search=${encodeURIComponent(name)}&per_page=10`
  );
  const match = existing.find(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
  if (match) return match.id;

  // Tenta criar — se já existir, o WordPress devolve term_id no erro
  try {
    const created = await wpFetch<{ id: number }>(endpoint, {
      method: "POST",
      body: JSON.stringify({ name, slug: toSlug(name) }),
    });
    return created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Extrair term_id do erro term_exists: {"term_id":116,...}
    const match = msg.match(/"term_id"\s*:\s*(\d+)/);
    if (match) return parseInt(match[1]);
    throw err;
  }
}

async function findOrCreateCategory(name: string): Promise<number> {
  return findOrCreateTaxonomy("/categories", name);
}

async function findOrCreateTag(name: string): Promise<number> {
  return findOrCreateTaxonomy("/tags", name);
}

export async function createDraft(input: WpDraftInput): Promise<WpPost> {
  const status = (process.env.WORDPRESS_DEFAULT_STATUS as "draft" | "publish") ?? "draft";

  const [categoryIds, tagIds] = await Promise.all([
    Promise.all(input.categoryNames.map(findOrCreateCategory)),
    Promise.all(input.tagNames.map(findOrCreateTag)),
  ]);

  // Formatar o conteúdo em blocos Gutenberg básicos
  const contentBlocks = input.content
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<!-- wp:paragraph -->\n<p>${p.trim()}</p>\n<!-- /wp:paragraph -->`)
    .join("\n\n");

  const body: Record<string, unknown> = {
    title: input.title,
    content: contentBlocks,
    excerpt: input.excerpt,
    slug: input.slug,
    status: input.status ?? status,
    categories: categoryIds,
    tags: tagIds,
    ...(input.featuredMediaId ? { featured_media: input.featuredMediaId } : {}),
    meta: {
      // Yoast SEO
      ...(input.metaTitle ? { _yoast_wpseo_title: input.metaTitle } : {}),
      ...(input.metaDescription ? { _yoast_wpseo_metadesc: input.metaDescription } : {}),
      // Subtítulo (requer mu-plugin redacao-hg-meta.php)
      ...(input.subtitulo ? { subtitulo: input.subtitulo } : {}),
      // PushAlert
      ...(input.pushTitle ? { _pushalert_post_title: input.pushTitle } : {}),
      ...(input.pushBody ? { _pushalert_post_message: input.pushBody } : {}),
      pushalert_send_notification: "1",
      // OneSignal — serializado como WordPress espera
      _onesignal_meta_box_notifications: JSON.stringify({
        send_notification: "1",
        customize_notification_title: "1",
        notification_title: input.onesignalTitle ?? input.pushTitle ?? "",
      }),
    },
  };

  return wpFetch<WpPost>("/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface WpSearchResult {
  id: number;
  link: string;
  title: string;
}

/** Procura posts PUBLICADOS que correspondam a um termo (para links internos). */
export async function searchPosts(query: string, perPage = 3): Promise<WpSearchResult[]> {
  try {
    const res = await wpFetch<Array<{ id: number; link: string; title: { rendered: string } }>>(
      `/posts?search=${encodeURIComponent(query)}&per_page=${perPage}&status=publish&orderby=relevance&_fields=id,link,title`
    );
    return res.map((p) => ({ id: p.id, link: p.link, title: p.title.rendered }));
  } catch {
    return [];
  }
}

/** Actualiza o conteúdo de um rascunho existente (ex.: edição do texto pelo editor). */
export async function updatePostContent(postId: number, content: string): Promise<void> {
  const blocks = content
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<!-- wp:paragraph -->\n<p>${p.trim()}</p>\n<!-- /wp:paragraph -->`)
    .join("\n\n");
  await wpFetch(`/posts/${postId}`, { method: "POST", body: JSON.stringify({ content: blocks }) });
}

/** Actualiza o título de um post existente (ex.: título corrigido pelo editor no Telegram). */
export async function updatePostTitle(postId: number, title: string): Promise<void> {
  await wpFetch(`/posts/${postId}`, { method: "POST", body: JSON.stringify({ title }) });
}

/** Define a imagem destacada de um post existente (ex.: imagem sugerida pelo editor). */
export async function updatePostFeaturedMedia(postId: number, mediaId: number): Promise<void> {
  await wpFetch(`/posts/${postId}`, { method: "POST", body: JSON.stringify({ featured_media: mediaId }) });
}

/** Publica um post existente (muda o estado para publish). Só usado após aprovação humana. */
export async function publishPost(postId: number): Promise<WpPost> {
  return wpFetch<WpPost>(`/posts/${postId}`, {
    method: "POST",
    body: JSON.stringify({ status: "publish" }),
  });
}

export interface WpListedPost {
  id: number;
  link: string;
  title: string;
  date: string; // ISO de publicação
  slug: string;
  contentText: string; // conteúdo sem HTML
  contentChars: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    // Entidades numéricas (&#8211; etc.) e nomeadas comuns do WordPress.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:quot|ldquo|rdquo);/gi, '"')
    .replace(/&(?:apos|lsquo|rsquo);/gi, "'")
    .replace(/&(?:ndash|mdash);/gi, "-")
    .replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lista posts PUBLICADOS para auditoria. Por defeito do mais antigo para o mais recente
 * (o peso morto vive no conteúdo antigo). Pagina em blocos de 100 (limite do WordPress) até
 * `limit`. Só leitura, não altera nada.
 */
export async function listPublishedPosts(opts: {
  limit: number;
  offset?: number;
  order?: "asc" | "desc";
}): Promise<WpListedPost[]> {
  const order = opts.order ?? "asc";
  const out: WpListedPost[] = [];
  let fetched = 0;
  let offset = opts.offset ?? 0;
  while (fetched < opts.limit) {
    const perPage = Math.min(100, opts.limit - fetched);
    const batch = await wpFetch<
      Array<{ id: number; link: string; title: { rendered: string }; date: string; slug: string; content: { rendered: string } }>
    >(
      `/posts?status=publish&per_page=${perPage}&offset=${offset}&orderby=date&order=${order}&_fields=id,link,title,date,slug,content`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const p of batch) {
      const text = stripHtml(p.content?.rendered ?? "");
      out.push({
        id: p.id,
        link: p.link,
        title: stripHtml(p.title?.rendered ?? ""),
        date: p.date,
        slug: p.slug,
        contentText: text,
        contentChars: text.length,
      });
    }
    fetched += batch.length;
    offset += batch.length;
    if (batch.length < perPage) break;
  }
  return out;
}

/**
 * Move um post para o LIXO do WordPress (reversível). NUNCA usa force=true (eliminação
 * permanente é proibida). Restaurável no admin (Lixo → Restaurar) ou por REST. Devolve o
 * estado anterior para o registo de reversão.
 */
export async function trashPost(postId: number): Promise<{ ok: boolean; previousStatus?: string; error?: string }> {
  try {
    // Lê o estado atual antes de mexer (para poder reverter).
    const before = await wpFetch<{ status: string }>(`/posts/${postId}?_fields=status`).catch(() => null);
    // DELETE sem force → move para o lixo (não apaga em definitivo).
    await wpFetch(`/posts/${postId}`, { method: "DELETE" });
    return { ok: true, previousStatus: before?.status ?? "publish" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro" };
  }
}

export async function testConnection(): Promise<{ ok: boolean; site: string }> {
  const data = await wpFetch<{ name: string }>("/");
  return { ok: true, site: data.name };
}
