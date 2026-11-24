/**
 * Que vídeos podem ser transcritos, e quais nunca.
 *
 * A regra é editorial antes de ser técnica. Transcrever um programa de estúdio de outro
 * jornal e transformá-lo em artigo não é apurar um facto, é pegar no trabalho deles — é a
 * cópia que a doutrina proíbe e que já custou o Discover a este site. Transcrever uma
 * conferência de imprensa do clube é o contrário: a fonte é primária, quem fala é o próprio,
 * e as declarações são citáveis com atribuição.
 *
 * Por isso a lista é BRANCA, e não negra: só entra o que está explicitamente autorizado.
 * Uma fonte nova não passa por esquecimento — passa por decisão.
 *
 * Lógica pura, sem I/O.
 */

/**
 * Domínios de fonte primária autorizados. Começa só no site oficial do Benfica, por decisão
 * do editor: alarga-se depois de se ver a qualidade das declarações extraídas.
 */
export const DOMINIOS_AUTORIZADOS = ["slbenfica.pt"];

/** Tecto de duração. Acima disto não se transcreve sem confirmação explícita. */
export const DURACAO_MAXIMA_SEG = 90 * 60;

/** Palavras no título ou no endereço que denunciam declarações de fonte primária. */
const SINAIS_CONFERENCIA = [
  "conferencia",
  "conferência",
  "antevisao",
  "antevisão",
  "pos-jogo",
  "pós-jogo",
  "flash",
  "declaracoes",
  "declarações",
  "entrevista",
];

function semAcentos(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** O domínio da página está na lista branca? */
export function fonteAutorizada(url: string): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Compara por sufixo de domínio, para apanhar www. e subdomínios, mas nunca um
  // domínio que apenas CONTENHA o nome (ex.: "slbenfica.pt.exemplo.com").
  return DOMINIOS_AUTORIZADOS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** A página tem cara de conferência de imprensa ou declarações? */
export function pareceConferencia(title: string, url: string): boolean {
  const alvo = semAcentos(`${title} ${url}`);
  return SINAIS_CONFERENCIA.some((s) => alvo.includes(semAcentos(s)));
}

export interface DecisaoTranscricao {
  transcrever: boolean;
  /** Motivo da recusa, para explicar ao editor em vez de falhar em silêncio. */
  motivo?: "fonte-nao-autorizada" | "nao-parece-conferencia" | "demasiado-longo";
}

/**
 * Decide se um candidato deve ser transcrito. A duração só é conhecida depois de resolver
 * o vídeo, por isso entra como opcional: chama-se duas vezes, antes e depois.
 */
export function decidirTranscricao(
  title: string,
  url: string,
  duracaoSeg?: number,
): DecisaoTranscricao {
  if (!fonteAutorizada(url)) return { transcrever: false, motivo: "fonte-nao-autorizada" };
  if (!pareceConferencia(title, url)) return { transcrever: false, motivo: "nao-parece-conferencia" };
  if (duracaoSeg != null && duracaoSeg > DURACAO_MAXIMA_SEG) {
    return { transcrever: false, motivo: "demasiado-longo" };
  }
  return { transcrever: true };
}

/** Frase para o editor, em português, quando não se transcreve. */
export function explicarRecusa(motivo: DecisaoTranscricao["motivo"], duracaoSeg?: number): string {
  switch (motivo) {
    case "fonte-nao-autorizada":
      return "Só transcrevo vídeos de fonte primária (site oficial do clube). Transcrever o programa de outro jornal seria copiar o trabalho deles.";
    case "nao-parece-conferencia":
      return "Esta página não tem cara de conferência de imprensa nem de declarações.";
    case "demasiado-longo":
      return `O vídeo tem ${Math.round((duracaoSeg ?? 0) / 60)} minutos, acima do tecto de ${DURACAO_MAXIMA_SEG / 60}. Confirma comigo antes de eu avançar.`;
    default:
      return "Não transcrevi.";
  }
}
