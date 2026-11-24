/**
 * Mapa de redireccionamentos 301 para a poda de conteúdo (docs/AUDITORIA-CONTEUDO.md).
 * A partir do título de um artigo apagado, escolhe a categoria/tema mais relevante para o
 * 301, evitando o "soft 404" de mandar tudo para a homepage. Puro e testável.
 *
 * Slugs reais das categorias do hugogil.pt (2026-07). URL = /category/<slug>/.
 */

const BASE = "https://hugogil.pt";

// Conteúdo de demonstração do tema (nada a ver com o Benfica) → homepage (não há categoria).
const JUNK_RE = /\b(fashion|yoga|winery|photography|interior|corporate identity|trends|weekend|studio)\b/i;

interface Rule {
  re: RegExp;
  slug: string; // slug da categoria de destino ("" = homepage)
}

// Ordem importa: a primeira regra que casa ganha.
const RULES: Rule[] = [
  { re: /\bfutsal\b/i, slug: "futsal-modalidades" },
  { re: /\bh[oó]quei\b/i, slug: "hoquei-modalidades" },
  { re: /\bbasquetebol\b/i, slug: "basquetebol-modalidades" },
  { re: /\b(voleibol|andebol|canoagem|triatlo|rugby|nata[çc][aã]o|gin[aá]stica|atletismo|bilhar|t[eé]nis|olímpico|artes marciais)\b/i, slug: "modalidades" },
  { re: /\b(juniores|juvenis|juvenil|sub[- ]?\d+|forma[çc][aã]o)\b/i, slug: "formacao-2" },
  { re: /\b(feminin[ao]s?)\b/i, slug: "femininos" },
  { re: /\b(arbitr|[aá]rbitro|clattenburg|penalti|p[eé]naltis|\bvar\b|uefa|platini|queixa)\b/i, slug: "arbitragem" },
  { re: /\b(contrata|contrato|refor[çc]o|renova|transfer|regressar|vai jogar|mercado)\b/i, slug: "mercado" },
];

/** Slug da categoria de destino para o 301 (ou "" para a homepage). */
export function redirectTargetSlug(title: string): string {
  if (JUNK_RE.test(title)) return "";
  for (const r of RULES) {
    if (r.re.test(title)) return r.slug;
  }
  return "futebol"; // por defeito: relatos de jogo e Benfica em geral
}

/** URL absoluto de destino do 301. */
export function redirectTargetUrl(title: string): string {
  const slug = redirectTargetSlug(title);
  return slug ? `${BASE}/category/${slug}/` : `${BASE}/`;
}

/** Extrai o caminho (path) de um URL absoluto, com barra final, para a regra do .htaccess. */
export function urlPath(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.endsWith("/") ? p : `${p}/`;
  } catch {
    return url;
  }
}
