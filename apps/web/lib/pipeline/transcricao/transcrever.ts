import OpenAI from "openai";

/**
 * Transcreve o áudio de uma conferência.
 *
 * O contexto (nome do treinador, adversário, competição) é dado ao motor de propósito: sem
 * ele os apelidos estrangeiros saem trocados, e um nome mal escrito numa citação é um erro
 * que chega ao site. Não resolve tudo — por isso a transcrição passa pelos teus olhos antes
 * de virar texto.
 */

/** Preço da transcrição, por minuto de áudio, em dólares. Rever quando a OpenAI mexer. */
const USD_POR_MINUTO = 0.006;
const USD_PARA_EUR = 0.92;

export const MODELO_TRANSCRICAO = "whisper-1";

export interface Transcricao {
  texto: string;
  modelo: string;
  custoEur: number;
}

export function custoTranscricaoEur(duracaoSeg: number): number {
  return (duracaoSeg / 60) * USD_POR_MINUTO * USD_PARA_EUR;
}

let cliente: OpenAI | null = null;
function openai(): OpenAI {
  if (!cliente) {
    cliente = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // O envio de uma conferência inteira demora, e o tecto por omissão do SDK não chega:
      // o primeiro ensaio real morreu em "Connection error" a meio do carregamento.
      timeout: 15 * 60 * 1000,
      maxRetries: 2,
    });
  }
  return cliente;
}

/**
 * Nomes que o motor tende a ouvir mal e que aparecem a toda a hora nas conferências.
 * Medido no primeiro ensaio real: "Marco Silva" saiu "Márcio Silva". Dar os nomes no prompt
 * é o remédio barato — não é infalível, e por isso o editor confere no cartão.
 * ACTUALIZAR quando mudar o plantel ou o treinador.
 */
export const GLOSSARIO = [
  // Erros vistos na conferência de 29 de julho, e a forma certa:
  //   "Márcio Silva" e "Marcos Silva" → Marco Silva
  //   "John Duran" → Jhon Durán
  //   "Bolonenses" → Belenenses
  "Marco Silva", "Rui Costa", "Benfica", "Estádio da Luz",
  "Jhon Durán", "Belenenses", "Sudakov", "Lenglet", "Rafa Silva",
  "Trubin", "Otamendi", "Tomás Araújo", "António Silva", "Schjelderup",
  "Prestianni", "Pavlidis", "Aursnes", "Leandro Barreiro", "Richard Ríos", "Lukebakio",
  "Trincão", "Florentino", "Bah", "Dedic", "St. Gallen",
];

/**
 * Transcreve uma conferência partida em pedaços, pela ordem, e junta o texto.
 *
 * Porquê por partes: esta máquina não consegue enviar o áudio inteiro (ver
 * SEGUNDOS_POR_PARTE em audio.ts). Cada pedaço leva como contexto o fim do texto anterior,
 * para a frase que ficou a meio não recomeçar do nada.
 */
export async function transcreverPartes(params: {
  partes: Buffer[];
  duracaoSeg: number;
  contexto?: string;
}): Promise<Transcricao & { partesFalhadas: number }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

  const pedacos: string[] = [];
  let partesFalhadas = 0;

  for (let i = 0; i < params.partes.length; i++) {
    const anterior = pedacos.length > 0 ? pedacos[pedacos.length - 1].slice(-300) : "";
    try {
      const texto = await transcreverPedaco(params.partes[i], i, params.contexto, anterior);
      if (texto) pedacos.push(texto);
    } catch (e) {
      // Um pedaço perdido não deita fora a conferência: fica o buraco assinalado.
      partesFalhadas++;
      pedacos.push(`[trecho ${i + 1} não transcrito: ${e instanceof Error ? e.message : "erro"}]`);
    }
  }

  return {
    texto: pedacos.join(" ").trim(),
    modelo: MODELO_TRANSCRICAO,
    custoEur: custoTranscricaoEur(params.duracaoSeg),
    partesFalhadas,
  };
}

async function transcreverPedaco(
  audio: Buffer,
  indice: number,
  contexto?: string,
  textoAnterior?: string,
): Promise<string> {
  const ficheiro = new File([new Uint8Array(audio)], `parte${indice}.mp3`, { type: "audio/mpeg" });
  const res = await openai().audio.transcriptions.create({
    file: ficheiro,
    model: MODELO_TRANSCRICAO,
    language: "pt",
    prompt: montarPrompt(contexto, textoAnterior),
  });
  return (res.text ?? "").trim();
}

/** O prompt do Whisper é curto (~224 tokens): nomes primeiro, contexto depois. */
function montarPrompt(contexto?: string, textoAnterior?: string): string {
  const partes = [
    `Conferência de imprensa de futebol em português europeu. Nomes: ${GLOSSARIO.join(", ")}.`,
  ];
  if (contexto) partes.push(`Contexto: ${contexto}.`);
  if (textoAnterior) partes.push(textoAnterior);
  return partes.join(" ").slice(0, 900);
}

export async function transcrever(params: {
  audio: Buffer;
  nomeFicheiro: string;
  duracaoSeg: number;
  /** Título da página, usado como contexto para os nomes próprios saírem certos. */
  contexto?: string;
}): Promise<Transcricao> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

  const ficheiro = new File([new Uint8Array(params.audio)], params.nomeFicheiro, { type: "audio/mpeg" });

  const res = await openai().audio.transcriptions.create({
    file: ficheiro,
    model: MODELO_TRANSCRICAO,
    language: "pt",
    prompt: params.contexto
      ? `Conferência de imprensa de futebol em português europeu. Contexto: ${params.contexto}.`
      : "Conferência de imprensa de futebol em português europeu.",
  });

  return {
    texto: (res.text ?? "").trim(),
    modelo: MODELO_TRANSCRICAO,
    custoEur: custoTranscricaoEur(params.duracaoSeg),
  };
}
