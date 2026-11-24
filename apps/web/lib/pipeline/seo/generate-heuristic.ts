/**
 * Geração e validação heurística de SEO / Google News / Discover. Pura e testável.
 * Gera slug, título SEO, meta descrição, título Discover, tags e valida comprimentos.
 */

export interface SeoFields {
  slug: string;
  seoTitle: string;
  metaDescription: string;
  discoverTitle: string;
  tags: string[];
  category: string | null;
}

export interface SeoIssue {
  type: "seoTitle" | "metaDescription" | "discoverTitle" | "slug" | "tags";
  severity: "warning" | "info";
  detail: string;
}

export interface SeoResult {
  fields: SeoFields;
  issues: SeoIssue[];
  passed: boolean;
}

// Requisitos práticos (Google): título SEO ~50-60, meta ~120-160, Discover até ~70.
const SEO_TITLE_MAX = 60;
const META_MIN = 110;
const META_MAX = 160;
const DISCOVER_MAX = 70;

export function toSlug(title: string): string {
  const SLUG_MAX = 70;
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= SLUG_MAX) return base;
  // Corta na FRONTEIRA da palavra: última hífen dentro do limite. Nunca deixa palavra a meio
  // (era o bug: "...uma-peca-pa", "...na-suica-f"). Descarta a palavra incompleta por inteiro.
  const cut = base.slice(0, SLUG_MAX);
  const lastDash = cut.lastIndexOf("-");
  const truncated = (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
  return trimTrailingConnectors(truncated);
}

// Conectores (artigos, preposições, conjunções) que ficam feios no fim de um slug truncado.
const CONNECTORS = new Set([
  "de", "do", "da", "dos", "das", "e", "a", "o", "as", "os", "ao", "aos", "um", "uma", "uns", "umas",
  "para", "com", "em", "no", "na", "nos", "nas", "por", "que", "se", "ou", "ja", "e-a", "sem", "sobre",
]);

/** Remove conectores soltos do fim do slug, para acabar sempre numa palavra com sentido. */
function trimTrailingConnectors(slug: string): string {
  let parts = slug.split("-");
  while (parts.length > 1 && CONNECTORS.has(parts[parts.length - 1])) parts = parts.slice(0, -1);
  return parts.join("-");
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

// Entidades conhecidas para tags (clubes, competições).
const KNOWN_ENTITIES = [
  "Benfica", "Sporting", "FC Porto", "Braga", "Vitória de Guimarães",
  "Liga Portugal", "Taça de Portugal", "Champions", "Liga Europa",
  "Seleção Nacional", "Arbitragem", "VAR", "Mercado",
];

// Palavras capitalizadas que NÃO são tags (inícios de frase, preposições, termos comuns).
const TAG_STOP = new Set([
  "O", "A", "Os", "As", "Um", "Uma", "De", "Do", "Da", "Dos", "Das", "Em", "No", "Na",
  "Nos", "Nas", "Por", "Para", "Com", "Sem", "Segundo", "Após", "Ainda", "Mais", "Já",
  "Há", "Trata", "Esta", "Este", "Estes", "Estas", "Isto", "Fontes", "Nova", "Novo",
  "Luz", "Também", "Quando", "Onde", "Como", "Mas", "Ontem", "Hoje", "Agora",
]);

/** Nomes próprios do texto: sequências de 2-3 palavras capitalizadas (ex.: "Ibrahima Ba"). */
function extractProperNouns(text: string): string[] {
  // 1ª palavra ≥3 letras; seguintes ≥1 (apanha apelidos curtos como "Ba", "Sá").
  const re = /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zá-úâêîôûãõç]{2,}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zá-úâêîôûãõç]+){1,2}\b/g;
  return (text.match(re) ?? []).filter((m) => !TAG_STOP.has(m.split(/\s+/)[0]));
}

export function extractTags(title: string, factTexts: string[]): string[] {
  const blob = [title, ...factTexts].join(" ");
  const known = KNOWN_ENTITIES.filter((e) => blob.toLowerCase().includes(e.toLowerCase()));
  // Nomes próprios do título (curado, fiável) e dos factos.
  const names = [...extractProperNouns(title), ...extractProperNouns(factTexts.join(" "))];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...known, ...names]) {
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, 8);
}

export function generateSeo(params: {
  title: string;
  lead: string | null;
  factTexts: string[];
  category: string | null;
}): SeoResult {
  const { title, lead, factTexts, category } = params;

  const seoTitle = truncateAtWord(title.trim(), SEO_TITLE_MAX);
  const discoverTitle = truncateAtWord(title.trim(), DISCOVER_MAX);
  const slug = toSlug(title);

  const metaBase = (lead ?? factTexts[0] ?? title).replace(/\s+/g, " ").trim();
  let metaDescription = truncateAtWord(metaBase, META_MAX);
  if (metaDescription.length < META_MIN && factTexts.length > 1) {
    metaDescription = truncateAtWord(`${metaBase} ${factTexts[1]}`, META_MAX);
  }

  const tags = extractTags(title, factTexts);

  const fields: SeoFields = { slug, seoTitle, metaDescription, discoverTitle, tags, category };

  const issues: SeoIssue[] = [];
  if (seoTitle.length > SEO_TITLE_MAX) issues.push({ type: "seoTitle", severity: "warning", detail: `Título SEO com ${seoTitle.length} caracteres (máx ${SEO_TITLE_MAX}).` });
  if (discoverTitle.length > DISCOVER_MAX) issues.push({ type: "discoverTitle", severity: "warning", detail: `Título Discover demasiado longo (${discoverTitle.length}).` });
  if (metaDescription.length < META_MIN) issues.push({ type: "metaDescription", severity: "warning", detail: `Meta descrição curta (${metaDescription.length} caracteres, ideal ${META_MIN}-${META_MAX}).` });
  if (!slug) issues.push({ type: "slug", severity: "warning", detail: "Slug vazio." });
  if (tags.length === 0) issues.push({ type: "tags", severity: "info", detail: "Nenhuma tag reconhecida." });

  return { fields, issues, passed: true };
}
