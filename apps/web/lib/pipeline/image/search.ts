/**
 * Pesquisa de imagem para a peça. SÓ pesquisa real (sem geração): procura imagens
 * livremente licenciadas (Openverse / Creative Commons). Modo simulado por defeito
 * devolve um marcador (sem chamada externa) para testar a máquina. Nunca usa imagens
 * de sites noticiosos como destaque (CLAUDE.md §9) nem imagens sintéticas.
 */

export interface FoundImage {
  url: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  license: string | null;
  attribution: string | null;
  source: "research" | "simulado" | "oficial";
}

/**
 * Domínios cujas imagens o editor tem direitos/autorização para usar como destaque.
 * Site oficial do SL Benfica: o editor detém os direitos e autorizações (regra do editor,
 * 2026-07-15). Quando o candidato vem de um destes domínios, usa-se a sua própria imagem.
 */
export const OWNED_IMAGE_DOMAINS = ["slbenfica.pt"];

export function isOwnedImageDomain(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl) return false;
  const s = sourceUrl.toLowerCase();
  return OWNED_IMAGE_DOMAINS.some((d) => s.includes(d));
}

/**
 * Imagem oficial do candidato (ex.: og:image do site do Benfica). Licença = autorizada
 * pelo editor. Formato inferido da extensão; se não houver, assume-se jpg (fotos do clube).
 */
export function officialImage(imageUrl: string, sourceName: string): FoundImage {
  return {
    url: imageUrl,
    width: null,
    height: null,
    bytes: null,
    format: extFromUrl(imageUrl) ?? "jpg",
    license: `Autorizado — ${sourceName} (direitos do editor)`,
    attribution: sourceName,
    source: "oficial",
  };
}

/** Constrói a query de pesquisa a partir do contexto editorial (puro). */
export function buildImageQuery(category: string | null, tags: string[], title: string): string {
  const terms = new Set<string>();
  if (category) terms.add(category);
  for (const t of tags.slice(0, 3)) terms.add(t);
  if (terms.size === 0) {
    // Fallback: primeiras palavras significativas do título.
    title.split(/\s+/).filter((w) => w.length > 4).slice(0, 2).forEach((w) => terms.add(w));
  }
  terms.add("futebol");
  return Array.from(terms).join(" ");
}

function extFromUrl(url: string): string | null {
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : null;
}

/** Marcador determinista para modo simulado (sem rede). Passa o QA técnico. */
export function simulatedImage(query: string): FoundImage {
  return {
    url: `https://placehold.co/1200x630/jpg?text=${encodeURIComponent(query)}`,
    width: 1200,
    height: 630,
    bytes: 120_000,
    format: "jpg",
    license: "simulado",
    attribution: "Imagem simulada (modo de teste do pipeline)",
    source: "simulado",
  };
}

/** Pesquisa real no Openverse (Creative Commons). Devolve o melhor candidato ou null. */
export async function searchOpenverse(query: string): Promise<FoundImage | null> {
  const params = new URLSearchParams({
    q: query,
    license_type: "commercial,modification",
    page_size: "5",
    mature: "false",
  });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "RedacaoHG/1.0 (editorial)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data.results?.[0];
  if (!first?.url) return null;
  return {
    url: first.url,
    width: first.width ?? null,
    height: first.height ?? null,
    bytes: first.filesize ?? null,
    format: (first.filetype ?? extFromUrl(first.url))?.toLowerCase().replace("jpeg", "jpg") ?? null,
    license: first.license ? `${first.license} ${first.license_version ?? ""}`.trim() : null,
    attribution: first.attribution ?? first.creator ?? null,
    source: "research",
  };
}
