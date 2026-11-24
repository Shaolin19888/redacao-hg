/**
 * Pilar 5-A da doutrina: A VOZ HUMANA. Uma peça correta mas morta não serve. O tom cinzento
 * de analista neutro e a linguagem de consultoria são proibidos.
 *
 * Este módulo é puro e dá SINAIS OBJECTIVOS ao Agente Revisor (que é quem julga o tom, com o
 * teste de ler em voz alta). Não substitui esse juízo: mede o que é mensurável (expressões de
 * consultoria, ritmo monocórdico) e entrega as provas.
 */

/**
 * Expressões que a doutrina proíbe pelo nome, no pilar 5-A. Aparecer uma destas é falha dura:
 * é o exemplo literal do que não se quer.
 */
const BANNED_PHRASES: { re: RegExp; label: string }[] = [
  { re: /a leitura interessante est[áa]/i, label: "a leitura interessante está…" },
  { re: /do ponto de vista de gest[ãa]o/i, label: "do ponto de vista de gestão" },
];

/** Marcadores de prosa de consultoria/relatório. Provas para o Revisor, não reprovação automática. */
const CONSULTANCY_MARKERS: { re: RegExp; label: string }[] = [
  { re: /estrutura da opera[çc][ãa]o/i, label: "estrutura da operação" },
  { re: /resultado a favor/i, label: "resultado a favor" },
  { re: /em termos de/i, label: "em termos de" },
  { re: /no que diz respeito/i, label: "no que diz respeito" },
  { re: /importa referir/i, label: "importa referir" },
  { re: /[ée] de salientar/i, label: "é de salientar" },
  { re: /verifica-se que/i, label: "verifica-se que" },
  { re: /constata-se/i, label: "constata-se" },
  { re: /afigura-se/i, label: "afigura-se" },
  { re: /no [âa]mbito de/i, label: "no âmbito de" },
  { re: /numa [óo]tica de/i, label: "numa ótica de" },
  { re: /por conseguinte/i, label: "por conseguinte" },
  { re: /n[ãa]o obstante/i, label: "não obstante" },
  { re: /serve de contraponto/i, label: "serve de contraponto" },
  { re: /do ponto de vista/i, label: "do ponto de vista" },
];

export interface VoiceSignals {
  /** Expressões proibidas pelo nome na doutrina (falha dura). */
  banned: string[];
  /** Marcadores de consultoria encontrados (provas para o Revisor). */
  consultancy: string[];
  /** Nº médio de palavras por frase. */
  avgSentenceWords: number;
  /** Nº de frases curtas (<= 8 palavras). O ritmo exige algumas, secas, a cortar as longas. */
  shortSentences: number;
  /** Total de frases. */
  sentences: number;
  /** Ritmo monocórdico: frases todas longas e nenhuma curta a cortar. */
  monotoneRhythm: boolean;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Analisa a voz de um texto e devolve sinais objectivos. */
export function analyzeVoice(body: string): VoiceSignals {
  const banned = BANNED_PHRASES.filter((p) => p.re.test(body)).map((p) => p.label);
  const consultancy = CONSULTANCY_MARKERS.filter((p) => p.re.test(body)).map((p) => p.label);

  const sents = splitSentences(body);
  const counts = sents.map(wordCount);
  const total = counts.reduce((a, b) => a + b, 0);
  const avg = sents.length > 0 ? total / sents.length : 0;
  const short = counts.filter((c) => c <= 8).length;

  // Ritmo morto: texto com corpo suficiente e NENHUMA frase curta a cortar as longas.
  // Limiar calibrado em artigos reais: os que respiram têm 1 a 4 frases curtas; os monocórdicos
  // têm zero. É só um SINAL para o Revisor (não reprova sozinho).
  const monotoneRhythm = sents.length >= 5 && short === 0 && avg >= 18;

  return {
    banned,
    consultancy,
    avgSentenceWords: Math.round(avg * 10) / 10,
    shortSentences: short,
    sentences: sents.length,
    monotoneRhythm,
  };
}

/** True quando o texto usa uma expressão que a doutrina proíbe pelo nome (falha dura). */
export function hasBannedVoicePhrase(body: string): boolean {
  return BANNED_PHRASES.some((p) => p.re.test(body));
}

/** Resumo legível dos sinais, para juntar ao pedido do Revisor como prova. */
export function describeVoiceSignals(v: VoiceSignals): string {
  const partes: string[] = [];
  if (v.banned.length) partes.push(`expressões PROIBIDAS pela doutrina: ${v.banned.join("; ")}`);
  if (v.consultancy.length) partes.push(`marcadores de linguagem de consultoria: ${v.consultancy.join("; ")}`);
  partes.push(`ritmo: ${v.sentences} frases, média de ${v.avgSentenceWords} palavras, ${v.shortSentences} frases curtas`);
  if (v.monotoneRhythm) partes.push("ritmo monocórdico: nenhuma frase curta a cortar as longas");
  return partes.join(" | ");
}
