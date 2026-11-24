/**
 * Editorial QA heurístico. Puro e testável. Verifica as regras editoriais mais duras:
 *  - CÓPIA (regra 3): n-grama longo do artigo que coincide com a fonte.
 *  - INVENÇÃO (regra 2): números e citações no artigo que não existem em nenhum facto
 *    confirmado — o sinal mais forte de facto inventado.
 *  - COMPRIMENTO: mínimo de palavras (200).
 *  - SENSÍVEL: presença de temas sensíveis → revisão humana reforçada.
 * Cópia e invenção são CRÍTICOS (rejeitam o texto). Os restantes são avisos.
 */

export type IssueSeverity = "critical" | "warning" | "info";

export interface QaIssue {
  type: "copia" | "invencao" | "comprimento" | "sensivel";
  severity: IssueSeverity;
  detail: string;
}

export interface EditorialQaResult {
  passed: boolean; // false se houver algum issue crítico
  score: number; // 0..1
  issues: QaIssue[];
  copiedPhrases: string[]; // frases copiadas da fonte, para o escritor evitar na reescrita
}

const MIN_WORDS = 200;
const COPY_NGRAM = 8; // nº de palavras consecutivas iguais que conta como cópia
// Fonte oficial do Benfica (fonte primária, textos curtos): limiar mais tolerante. Sem isto,
// anúncios curtos do clube esgotavam as reescrituras e morriam em FAILED sem chegar à aprovação.
const COPY_NGRAM_OFFICIAL = 14;

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Maior sequência de palavras consecutivas do artigo presente em algum texto-fonte. */
export function longestVerbatimRun(articleBody: string, sourceTexts: string[]): number {
  const art = normalizeWords(articleBody);
  const sources = sourceTexts.map((s) => " " + normalizeWords(s).join(" ") + " ");
  let longest = 0;

  for (let i = 0; i < art.length; i++) {
    for (let len = art.length - i; len > longest; len--) {
      const gram = " " + art.slice(i, i + len).join(" ") + " ";
      if (sources.some((s) => s.includes(gram))) {
        longest = Math.max(longest, len);
        break;
      }
    }
  }
  return longest;
}

/**
 * Frases do artigo copiadas verbatim da fonte (sequências ≥ minLen palavras), maximais e
 * não sobrepostas. Devolve o texto ORIGINAL do artigo (com maiúsculas/acentos) para o
 * escritor saber o que reformular. Ver editorial-qa (feedback de reescrita).
 */
export function findCopiedPhrases(articleBody: string, sourceTexts: string[], minLen: number = COPY_NGRAM): string[] {
  const origWords = articleBody.split(/\s+/).filter(Boolean); // preserva original
  const art = normalizeWords(articleBody);
  const sources = sourceTexts.map((s) => " " + normalizeWords(s).join(" ") + " ");
  // normalizeWords e split podem divergir em contagem; alinhamos pelo mínimo por segurança.
  const n = Math.min(art.length, origWords.length);
  const phrases: string[] = [];

  let i = 0;
  while (i < n) {
    let best = 0;
    for (let len = n - i; len >= minLen; len--) {
      const gram = " " + art.slice(i, i + len).join(" ") + " ";
      if (sources.some((s) => s.includes(gram))) { best = len; break; }
    }
    if (best >= minLen) {
      phrases.push(origWords.slice(i, i + best).join(" "));
      i += best;
    } else {
      i++;
    }
  }
  return phrases.slice(0, 6);
}

/** Extrai números (2+ dígitos, ou dígitos isolados relevantes) de um texto. */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d+/g) ?? []).filter((n) => n.length >= 1);
}

/** Extrai spans entre aspas (declarações). */
export function extractQuotes(text: string): string[] {
  const matches = text.match(/[«"]([^»"]{3,})[»"]/g) ?? [];
  return matches.map((m) => m.replace(/[«»"]/g, "").trim());
}

/**
 * Remove as declarações entre aspas («...» ou "...") do texto. Uma declaração feita aos
 * meios de comunicação e reproduzida entre aspas com atribuição NÃO é cópia (regra do
 * editor): pode ser usada tal como foi dita. Só a tiramos da comparação de cópia — a
 * verificação de invenção continua a exigir que a citação exista nos factos.
 */
export function stripQuotedSpans(text: string): string {
  return text.replace(/[«"][^«»"]*[»"]/g, " ");
}

/**
 * Conta as palavras de "prosa" numa frase: exclui nomes próprios (equipas, atletas,
 * presidentes — inicial maiúscula), números e resultados (2-1). Uma coincidência com a
 * fonte feita só de factos inevitáveis (nomes, resultados) não é cópia; só conta como
 * cópia se sobrar prosa comum suficiente para ter sido "escrita à mão" igual à fonte.
 */
export function proseWordCount(phrase: string): number {
  return phrase.split(/\s+/).filter((w) => {
    const clean = w.replace(/^[«"'(]+|[»"'.,;:!?)]+$/g, "");
    if (!clean) return false;
    if (/^\d+([-:x/]\d+)?$/.test(clean)) return false; // número ou resultado (2-1, 2:1)
    const first = clean.normalize("NFD")[0];
    return /[a-z]/.test(first); // inicial minúscula → prosa, não nome próprio
  }).length;
}

/** Mínimo de palavras de prosa numa frase coincidente para contar como cópia real. */
const PROSE_MIN = 5;

export interface EditorialQaInput {
  body: string;
  wordCount: number;
  confirmedFactTexts: string[];
  sourceTexts: string[]; // evidenceQuotes + conteúdo da fonte
  hasSensitiveFacts: boolean;
  official?: boolean; // fonte oficial do Benfica → limiar de cópia mais tolerante
}

export function runEditorialQa(input: EditorialQaInput): EditorialQaResult {
  const issues: QaIssue[] = [];

  // 1. Cópia. As declarações entre aspas são retiradas da comparação (podem ser reproduzidas
  // tal como foram ditas, com atribuição). Uma coincidência feita só de nomes próprios
  // (equipas, atletas, presidentes) e resultados não conta — só conta se sobrar prosa comum.
  const copyNgram = input.official ? COPY_NGRAM_OFFICIAL : COPY_NGRAM;
  const bodyForCopy = stripQuotedSpans(input.body);
  const verbatim = longestVerbatimRun(bodyForCopy, input.sourceTexts);
  let copiedPhrases: string[] = [];
  if (verbatim >= copyNgram) {
    const candidates = findCopiedPhrases(bodyForCopy, input.sourceTexts, copyNgram);
    const realCopy = candidates.filter((p) => proseWordCount(p) >= PROSE_MIN);
    if (realCopy.length > 0) {
      copiedPhrases = realCopy;
      issues.push({
        type: "copia",
        severity: "critical",
        detail: `Sequência copiada da fonte (${verbatim} palavras): «${realCopy[0].slice(0, 80)}».`,
      });
    }
  }

  // 2. Invenção — números no artigo que não estão em nenhum facto confirmado.
  const factsBlob = input.confirmedFactTexts.join(" ");
  const factNumbers = new Set(extractNumbers(factsBlob));
  const inventedNumbers = extractNumbers(input.body).filter((n) => !factNumbers.has(n));
  if (inventedNumbers.length > 0) {
    issues.push({
      type: "invencao",
      severity: "critical",
      detail: `Números sem suporte nos factos confirmados: ${Array.from(new Set(inventedNumbers)).join(", ")}.`,
    });
  }
  // Invenção — citações no artigo que não constam dos factos confirmados.
  const factsLower = factsBlob.toLowerCase();
  const inventedQuotes = extractQuotes(input.body).filter((q) => !factsLower.includes(q.toLowerCase().slice(0, 20)));
  if (inventedQuotes.length > 0) {
    issues.push({
      type: "invencao",
      severity: "critical",
      detail: `Declaração(ões) sem suporte nos factos confirmados.`,
    });
  }

  // 3. Comprimento mínimo
  if (input.wordCount < MIN_WORDS) {
    issues.push({
      type: "comprimento",
      severity: "warning",
      detail: `Artigo com ${input.wordCount} palavras, abaixo do mínimo de ${MIN_WORDS}. Precisa de revisão humana.`,
    });
  }

  // 4. Temas sensíveis
  if (input.hasSensitiveFacts) {
    issues.push({
      type: "sensivel",
      severity: "warning",
      detail: "Contém factos sensíveis (mercado, lesão, declaração). Revisão humana reforçada recomendada.",
    });
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const score = hasCritical ? 0 : Math.max(0, 1 - warnings * 0.25);

  return { passed: !hasCritical, score, issues, copiedPhrases };
}
