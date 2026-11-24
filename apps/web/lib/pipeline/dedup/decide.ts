import { hammingDistance, tokenize } from "./simhash";

/**
 * Decisão pura de duplicação (sem I/O), testável isoladamente.
 * Apanha três situações:
 *  1. Título exactamente igual (após normalização).
 *  2. Repost quase-verbatim (SimHash com distância de Hamming baixa).
 *  3. MESMO TEMA — paráfrase de outra fonte sobre o mesmo assunto: partilham uma
 *     entidade própria (ex. apelido do jogador) e têm sobreposição de tokens suficiente.
 *     Editorialmente: não queremos duas notícias iguais sobre o mesmo tema.
 */

export interface DedupCandidate {
  id: string;
  simhash: string | null;
  title: string;
  text: string; // título + resumo (original, com maiúsculas) para tema/entidades
}

export interface DedupTarget extends DedupCandidate {}

export interface DedupDecision {
  isDuplicate: boolean;
  duplicateOfId: string | null;
  distance: number | null;
  reason: "simhash" | "titulo-exacto" | "mesmo-tema" | null;
}

export const DEFAULT_HAMMING_THRESHOLD = 6;
/**
 * Sobreposição mínima de tokens do TÍTULO para confirmar "mesmo tema". O título é mais
 * discriminativo que o resumo (que dilui). Calibrado: paráfrase da mesma transferência ≈ 0.29.
 * Nota: distinguir "mesmo jogador, evento diferente" (golo vs transferência) por palavras é
 * limitado; preferimos apanhar duplicados a deixar passar notícias iguais (pedido do editor).
 */
export const TOPIC_JACCARD_THRESHOLD = 0.25;

/**
 * Sobreposição das palavras de conteúdo do título acima da qual é o mesmo tema, sem precisar
 * de nome próprio partilhado.
 *
 * Porquê: a regra da entidade partilhada é um E, e há temas que simplesmente NÃO têm nome
 * próprio nenhum — a terceira camisola, o calendário, a venda de bilhetes. Nesses, o
 * extractEntities devolve lista vazia e o dedup ficava cego, e o editor recebia quatro
 * cartões sobre a mesma camisola para recusar um a um.
 *
 * Usa-se CONTENÇÃO (interseção a dividir pelo título mais curto) e não Jaccard: o mesmo
 * assunto vem com títulos de comprimentos muito diferentes ("Terceira camisola do SL Benfica
 * para 2026/27" contra "FOTOS: Benfica revela a terceira camisola com tons de vermelho e
 * azul"), e o Jaccard castiga a diferença de comprimento em vez de medir a sobreposição.
 *
 * Calibrado contra 600 candidatos reais de 14 dias: a 0,75 os pares apanhados são todos a
 * mesma história em jornais diferentes; a 0,60 já juntava peças distintas ("Morreu Franco
 * Baresi" com "Ruben Amorim presta tributo a Franco Baresi").
 */
export const TITLE_CONTAINMENT_THRESHOLD = 0.75;

/**
 * Palavras que não distinguem um tema de outro: gramaticais, jargão de cartola de jornal
 * (FOTOS, VÍDEO, OFICIAL) e os clubes, que aparecem em quase todos os títulos.
 */
const TITLE_STOP = new Set([
  "para", "com", "que", "dos", "das", "nos", "nas", "pelo", "pela", "por", "mais", "menos",
  "ainda", "como", "sobre", "entre", "sem", "seu", "sua", "este", "esta", "esse", "essa",
  "aquele", "isso", "nao", "sim", "uma", "uns", "umas", "the", "and", "ser", "sao", "foi",
  "era", "vai", "vao", "tem", "tinha", "depois", "antes", "onde", "quando", "quem", "qual",
  "tudo", "todo", "toda", "todos", "todas", "aqui", "esta", "estao",
  "jogo", "jogos", "epoca", "temporada", "nova", "novo", "novos", "novas",
  "fotos", "foto", "video", "videos", "direto", "oficial", "mercado", "ponto", "situacao",
  "detalhes", "benfica", "sporting", "porto", "braga", "liga", "portugal",
]);

/** Palavras do título que efectivamente identificam o assunto. */
export function contentTokens(title: string): Set<string> {
  return new Set(tokenize(title).filter((t) => !TITLE_STOP.has(t)));
}

/**
 * Quanto do lado mais curto está contido no outro, olhando só às palavras de conteúdo.
 *
 * Duas salvaguardas, ambas vindas de calibração com títulos reais:
 *  - NÚCLEO: os dois TÍTULOS têm de concordar em pelo menos duas palavras de conteúdo. Sem
 *    isto, duas crónicas de opinião com títulos vagos ("Reforços para a época" e "Tudo foi
 *    de mais") colavam-se por causa dos resumos.
 *  - Um título curto é completado com o resumo, porque a fonte oficial titula em três
 *    palavras ("Terceira camisola do SL Benfica") o que os jornais titulam em doze.
 */
export function titleContainment(aTitle: string, aText: string, bTitle: string, bText: string): number {
  const At = contentTokens(aTitle);
  const Bt = contentTokens(bTitle);
  const nucleo = [...At].filter((t) => Bt.has(t)).length;
  if (nucleo < 2) return 0;

  const A = At.size < 4 ? new Set([...At, ...contentTokens(aText)]) : At;
  const B = Bt.size < 4 ? new Set([...Bt, ...contentTokens(bText)]) : Bt;
  if (A.size < 2 || B.size < 2) return 0;

  const comuns = [...A].filter((t) => B.has(t)).length;
  return comuns / Math.min(A.size, B.size);
}

// Clubes, alcunhas e termos comuns que NÃO servem para identificar um tema específico.
const ENTITY_STOP = new Set([
  "benfica", "sporting", "porto", "braga", "guimaraes", "vitoria", "flamengo",
  "river", "plate", "liga", "portugal", "argentina", "brasil", "alvalade", "luz",
  "dragao", "dragoes", "encarnados", "encarnado", "leoes", "leao", "aguias", "aguia",
  "record", "bola", "jogo", "simulacao", "pipeline", "nacional", "jornada", "clube",
]);

function normalizeTitle(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "").trim();
}

/** Nomes próprios prováveis: palavras capitalizadas (≥4 letras), fora da stoplist. */
export function extractEntities(text: string): string[] {
  const caps = text.match(/\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zá-úâêîôûãõç]{3,}/g) ?? [];
  const norm = caps.map((w) => w.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""));
  return Array.from(new Set(norm)).filter((w) => !ENTITY_STOP.has(w));
}

/** Fonte oficial do Benfica (site do clube): tem prioridade editorial sobre as outras. */
export function isOfficialBenficaSource(sourceUrl: string | null | undefined): boolean {
  return !!sourceUrl && sourceUrl.toLowerCase().includes("slbenfica.pt");
}

export function jaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

/**
 * Dois itens tratam do MESMO TEMA: partilham uma entidade própria (ex. apelido do jogador)
 * e os títulos têm sobreposição suficiente. Base do agrupamento multi-fonte e da regra
 * "mesmo-tema" do dedup. Conservador de propósito: juntar temas diferentes é pior.
 */
export function isSameTopic(
  aTitle: string,
  aText: string,
  bTitle: string,
  bText: string,
  jaccardThreshold: number = TOPIC_JACCARD_THRESHOLD
): boolean {
  const j = jaccard(aTitle, bTitle);
  // Títulos que dizem o mesmo chegam por si: há temas sem nome próprio nenhum (camisola,
  // calendário, bilhetes), onde a regra da entidade partilhada nunca dispara.
  if (titleContainment(aTitle, aText, bTitle, bText) >= TITLE_CONTAINMENT_THRESHOLD) return true;
  const aEnt = extractEntities(aText);
  const bEnt = extractEntities(bText);
  const sharedEntity = aEnt.some((e) => bEnt.includes(e));
  return sharedEntity && j >= jaccardThreshold;
}

export function decideDuplicate(
  target: DedupTarget,
  others: DedupCandidate[],
  threshold: number = DEFAULT_HAMMING_THRESHOLD
): DedupDecision {
  const targetTitle = normalizeTitle(target.title);

  let bestSimhash: { id: string; distance: number } | null = null;
  let firstSameTopic: string | null = null;

  for (const other of others) {
    if (other.id === target.id) continue;

    // 1. Título exactamente igual: verbatim inequívoco, decide já.
    if (targetTitle.length > 0 && normalizeTitle(other.title) === targetTitle) {
      return { isDuplicate: true, duplicateOfId: other.id, distance: 0, reason: "titulo-exacto" };
    }

    // 2. Repost quase-verbatim por simhash.
    if (target.simhash && other.simhash) {
      const d = hammingDistance(target.simhash, other.simhash);
      if (d <= threshold && (bestSimhash === null || d < bestSimhash.distance)) {
        bestSimhash = { id: other.id, distance: d };
      }
    }

    // 3. Mesmo tema (paráfrase): regista, mas NÃO decide já — o verbatim tem precedência,
    // mesmo que apareça mais à frente na lista (senão um repost mascarava-se de paráfrase).
    if (firstSameTopic === null && isSameTopic(target.title, target.text, other.title, other.text)) {
      firstSameTopic = other.id;
    }
  }

  // Verbatim (simhash) vence a paráfrase.
  if (bestSimhash) {
    return { isDuplicate: true, duplicateOfId: bestSimhash.id, distance: bestSimhash.distance, reason: "simhash" };
  }
  if (firstSameTopic) {
    return { isDuplicate: true, duplicateOfId: firstSameTopic, distance: null, reason: "mesmo-tema" };
  }
  return { isDuplicate: false, duplicateOfId: null, distance: null, reason: null };
}
