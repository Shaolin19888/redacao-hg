import { OUTLETS } from "./media-outlets";

/**
 * Verificações DETERMINISTAS sobre o corpo da peça, aplicadas pelo Agente Revisor.
 * Estas somam-se às regras escritas na doutrina, não as substituem.
 *
 *  1. BASTIDORES: nada de instruções internas ou processo editorial no texto publicado.
 *     "por indicação do editor", "conforme as regras", "de acordo com a doutrina", "o editor pediu".
 *  2. MARCA DE INFORMAÇÃO NÃO OFICIAL: a doutrina (§7) admite UMA marca por peça. Duas ou mais
 *     é repetição, que é exactamente o que a doutrina proíbe.
 */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- 1. Bastidores / instruções internas ---

// Substantivos do domínio que tornam "conforme as regras" uma frase legítima de futebol
// ("conforme as regras da competição"), e não uma fuga de instruções internas.
const DOMINIO_LEGITIMO = "(?:d[aoe]s?\\s+)?(?:competi|jogo|prova|liga|uefa|fifa|campeonato|modalidade|torneio|elegibilidade|fair|arbitragem|desempate)";

const INTERNAL_LEAKS: { re: RegExp; label: string }[] = [
  { re: /por indica[çc][ãa]o d[oa]\s+editor[a]?/i, label: "por indicação do editor" },
  { re: /o\s+editor\s+(pediu|solicitou|mandou|pretende|quer)/i, label: "o editor pediu" },
  { re: /(?:de acordo com|conforme|segundo|seguindo)\s+a\s+doutrina/i, label: "de acordo com a doutrina" },
  { re: /(?:de acordo com|conforme|segundo)\s+as\s+regras\s+editoriais/i, label: "conforme as regras editoriais" },
  // "conforme as regras" solto (sem substantivo do domínio a seguir) = instrução interna.
  { re: new RegExp(`(?:de acordo com|conforme|segundo)\\s+as\\s+regras(?!\\s+${DOMINIO_LEGITIMO})`, "i"), label: "conforme as regras" },
  { re: /conforme\s+(solicitado|pedido|indicado|instru[íi]do)/i, label: "conforme solicitado" },
  { re: /(?:de acordo com|segundo)\s+as\s+instru[çc][õo]es/i, label: "segundo as instruções" },
  { re: /(?:conforme|de acordo com|segundo)\s+o\s+(briefing|prompt|pedido do utilizador)/i, label: "conforme o briefing" },
  { re: /o\s+utilizador\s+(pediu|quer|solicitou)/i, label: "o utilizador pediu" },
  { re: /(?:como|tal como)\s+(?:me\s+)?(?:foi\s+)?(?:pedido|solicitado)/i, label: "como pedido" },
  { re: /(?:seguindo|cumprindo)\s+as\s+(?:orienta[çc][õo]es|diretrizes|directrizes)\s+(?:internas|editoriais)/i, label: "seguindo as orientações internas" },
];

/** Devolve as expressões de bastidores encontradas no corpo (vazio = limpo). */
export function detectInternalLeaks(text: string): string[] {
  return INTERNAL_LEAKS.filter((p) => p.re.test(text)).map((p) => p.label);
}

export function hasInternalLeak(text: string): boolean {
  return INTERNAL_LEAKS.some((p) => p.re.test(text));
}

// --- 2. Contagem da marca de informação não oficial ---

const OUTLETS_GROUP = OUTLETS.map(escapeRe).join("|");

/**
 * Formas de marcar que a informação não é oficial. Cada ocorrência conta.
 * A doutrina admite UMA por peça; a partir da segunda é repetição.
 */
const UNOFFICIAL_MARKERS: RegExp[] = [
  // Atribuição a um órgão nomeado: "segundo a Record", "A Bola avança"
  new RegExp(`(?:[Ss]egundo|[Dd]e acordo com|[Cc]onforme)\\s+(?:a|o|à|ao)?\\s*(?:${OUTLETS_GROUP})(?![\\p{L}])`, "gu"),
  new RegExp(`(?<![\\p{L}])(?:${OUTLETS_GROUP})(?![\\p{L}])\\s+(?:avan[çc]a|avan[çc]ou|escreve|escreveu|noticia|noticiou|garante|adianta|revela)`, "gu"),
  // Atribuição genérica à imprensa
  /(?:segundo|de acordo com|conforme)\s+(?:a\s+)?(?:imprensa|comunica[çc][ãa]o social|os\s+jornais|v[áa]rios\s+jornais|a\s+imprensa\s+desportiva)/gi,
  // Ressalvas de não confirmação
  /n[ãa]o\s+(?:foi\s+)?confirmad[oa]/gi,
  /n[ãa]o\s+confirmou/gi,
  /sem\s+confirma[çc][ãa]o/gi,
  /(?:ainda\s+)?n[ãa]o\s+[ée]\s+oficial/gi,
  /(?:est[áa]|fica)\s+por\s+confirmar/gi,
  /alegadamente/gi,
];

export interface UnofficialMarkerCount {
  total: number;
  matches: string[];
}

/** Conta as marcas de informação não oficial no corpo. A doutrina admite no máximo UMA. */
export function countUnofficialMarkers(text: string): UnofficialMarkerCount {
  const matches: string[] = [];
  for (const re of UNOFFICIAL_MARKERS) {
    const found = text.match(re);
    if (found) matches.push(...found.map((m) => m.trim()));
  }
  return { total: matches.length, matches };
}

/** True quando a peça repete a marca de não oficial (2 ou mais vezes). */
export function repeatsUnofficialMarker(text: string): boolean {
  return countUnofficialMarkers(text).total > 1;
}

// --- 3. Aberturas formulaicas (todos os artigos a começar igual) ---

// Fórmulas batidas de abertura. O problema não é a palavra, é TODOS os textos começarem assim.
// A regra ataca a PRIMEIRA frase; o Writer é obrigado a variar a abertura.
// NOTA: são padrões ESTRUTURAIS, não palavras fixas. Listar palavras não chega — o modelo
// troca o substantivo e mantém o molde ("Há nomes que" → "Há despedidas que" → "Há parcerias
// que"). Cada entrada apanha a construção retórica inteira.
const FORMULAIC_OPENINGS: { re: RegExp; label: string }[] = [
  { re: /^reparem\b/, label: "«Reparem…»" },
  { re: /^vamos ao (que interessa|facto|essencial|importante)/, label: "«Vamos ao que interessa/facto…»" },
  { re: /^vamos (direto|direitos|ja) ao/, label: "«Vamos direto ao…»" },
  { re: /^come[cç](ou|emos|amos)\b/, label: "«Começou / Comecemos…»" },
  { re: /^imaginem\b/, label: "«Imaginem…»" },
  { re: /^deixem-me\b/, label: "«Deixem-me…»" },
  // Construção "Há <substantivo> que…" com QUALQUER substantivo (11 ocorrências reais).
  { re: /^ha \w+ que\b/, label: "«Há X que…»" },
  // "O nome de X…" / "O nome que…" (10 ocorrências reais).
  { re: /^o nome (de|que|do|da)\b/, label: "«O nome de X…»" },
  // "Já se sabe", "Já está", "Já há", "Já cheira" (7 ocorrências reais).
  { re: /^ja (se sabe|esta|ha|cheira|e)\b/, label: "«Já se sabe / Já está…»" },
  { re: /^atencao a este nome/, label: "«Atenção a este nome…»" },
  { re: /^poucos\b/, label: "«Poucos…»" },
  { re: /^raramente\b/, label: "«Raramente…»" },
  { re: /^(existem|ha) (coisas|momentos|dias|jogos|equipas) que\b/, label: "«Há momentos/dias que…»" },
];

/** Primeira frase da peça, normalizada (minúsculas, sem acentos). */
function firstSentence(body: string): string {
  return body
    .trim()
    .split(/\n|(?<=[.!?])\s/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/** Devolve a fórmula de abertura batida usada (ou null). Analisa só a primeira frase. */
export function detectFormulaicOpening(body: string): string | null {
  const first = firstSentence(body);
  for (const p of FORMULAIC_OPENINGS) if (p.re.test(first)) return p.label;
  return null;
}

/**
 * "Molde" da abertura: as duas primeiras palavras, para detectar repetição de construção
 * mesmo em padrões que ainda não estão catalogados. Aberturas FACTUAIS (que começam por uma
 * entidade ou por um número) são deixadas de fora, porque repetir "O Benfica…" num site sobre
 * o Benfica é natural e não é muleta.
 */
export function openingMould(body: string): string | null {
  const first = firstSentence(body);
  const palavras = first.replace(/[^\p{L}\p{N}\s-]/gu, "").split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return null;
  // Arranque por número (ex.: "2-1 para o St. Gallen") é factual, não é molde retórico.
  if (/^\d/.test(palavras[0])) return null;
  return `${palavras[0]} ${palavras[1]}`;
}
