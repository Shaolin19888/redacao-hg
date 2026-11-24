/**
 * Filtro de entrada para páginas de vídeo, directo e galeria.
 *
 * Contexto: o Record publica muita coisa onde a notícia está no som ou na imagem e a página
 * traz meia dúzia de linhas de texto. O pipeline extrai factos de texto, por isso estas
 * morrem sem base factual — foi o que aconteceu à peça do Pavlidis, uma página do
 * "Record na Hora".
 *
 * Um filtro cego a tudo o que fosse vídeo era tentador (10% da recolha) mas custava caro:
 * das 372 do histórico, 8 chegaram a texto e 3 foram PUBLICADAS. Por isso o filtro é a duas
 * velocidades, calibrado contra as decisões reais do editor.
 *
 *  1. Secções que nunca deram nada: fotogalerias, "Record na Hora", infografias, directos e
 *     ao-minuto. 104 candidatos no histórico, 44 cartões enviados ao editor, ZERO textos.
 *     Fora, sem discussão.
 *
 *  2. Vídeos avulso (/videos/): 268 candidatos, dos quais o editor mandou escrever 4 — e as
 *     quatro são o Benfica ou o Marco Silva a falar, nunca um comentador de estúdio. Guarda-se
 *     o que traz voz primária: uma citação directa entre aspas angulares, ou o Benfica como
 *     protagonista. Deixa passar 101 dos 268 e guarda as 4 que o editor quis.
 *
 * A regra é grosseira de propósito: a triagem e o gate de aprovação vêm a seguir e são eles
 * que decidem mesmo. Aqui só se evita gastar triagem no que nunca dá nada.
 *
 * Lógica pura, sem I/O.
 */

/** Secções onde a notícia nunca está em texto. Nenhuma deu uma peça em todo o histórico. */
const SECCOES_SEM_TEXTO = [
  "fotogaleria",
  "fotogalerias",
  "galeria",
  "galerias",
  "infografia",
  "infografias",
  "record-na-hora",
  "em-direto",
  "direto",
  "ao-minuto",
  "podcast",
  "podcasts",
];

/** Secções de vídeo avulso, onde às vezes há peça: dependem do título. */
const SECCOES_VIDEO = ["video", "videos", "multimedia", "multimédia"];

const RE_SEM_TEXTO = new RegExp(`/(${SECCOES_SEM_TEXTO.join("|")})/`, "i");
const RE_VIDEO = new RegExp(`/(${SECCOES_VIDEO.join("|")})/`, "i");

/** Citação directa entre aspas angulares, o sinal de que alguém falou. */
const RE_CITACAO = /«[^»]{10,}»/;
/** O Benfica como protagonista (o clube, não uma menção de passagem noutro tema). */
const RE_BENFICA = /benfica|encarnad|águias|aguias/i;

function caminho(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export interface DecisaoEntrada {
  ignorar: boolean;
  /** Porquê, para o registo e para o painel. */
  motivo?: "seccao-sem-texto" | "video-sem-voz-primaria";
}

/**
 * Decide se um item recolhido deve ser ignorado à entrada, antes de custar triagem.
 * O título entra na decisão: é ele que distingue o Marco Silva a falar de um comentador.
 */
export function decidirEntrada(url: string, title: string): DecisaoEntrada {
  if (!url) return { ignorar: false };
  const p = caminho(url);

  if (RE_SEM_TEXTO.test(p)) return { ignorar: true, motivo: "seccao-sem-texto" };

  if (RE_VIDEO.test(p)) {
    const vozPrimaria = RE_CITACAO.test(title) || RE_BENFICA.test(title);
    if (!vozPrimaria) return { ignorar: true, motivo: "video-sem-voz-primaria" };
  }

  return { ignorar: false };
}

/** Atalho para quem só quer saber se entra. */
export function ignorarNaEntrada(url: string, title: string): boolean {
  return decidirEntrada(url, title).ignorar;
}
