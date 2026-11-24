import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Extrai o áudio de um stream de vídeo para um ficheiro pequeno, próprio para transcrição.
 *
 * Mono a 16 kHz é o que os motores de transcrição querem: mais do que isso é peso sem
 * ganho. Uma conferência de 30 minutos fica em poucos megabytes, bem abaixo do limite de
 * 25 MB da API.
 *
 * O ficheiro é temporário e apagado no fim, sempre — não fica áudio de terceiros no disco.
 */

const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";

/** Tecto de segurança do processo, para um stream que não acaba não prender o worker. */
const TIMEOUT_MS = 10 * 60 * 1000;

export interface AudioExtraido {
  buffer: Buffer;
  /** Caminho já apagado; fica só para o registo. */
  nomeFicheiro: string;
  bytes: number;
}

/**
 * Duração de cada pedaço, em segundos.
 *
 * Esta máquina NÃO consegue enviar o áudio de uma conferência inteira: um ficheiro de 7 MB
 * morre sempre em "Connection error", tanto do terminal como do worker, tanto pela biblioteca
 * da OpenAI como por curl directo. Medido: 236 KB passam em 4 segundos, 1,1 MB em 13, 7 MB
 * nunca. Cinco minutos a 32 kbps dão ~1,1 MB, que é o maior tamanho provado a funcionar.
 *
 * Ganho lateral: um pedaço que falhe repete-se sozinho, sem deitar fora a conferência toda.
 */
export const SEGUNDOS_POR_PARTE = 300;

/**
 * Extrai o áudio e devolve-o já partido em pedaços transcritíveis, pela ordem certa.
 * O corte é feito pelo ffmpeg numa só passagem sobre o stream.
 */
export async function extrairAudioEmPartes(
  streamUrl: string,
  segundosPorParte: number = SEGUNDOS_POR_PARTE,
): Promise<{ partes: Buffer[]; bytesTotais: number }> {
  const dir = await mkdtemp(join(tmpdir(), "redacao-audio-"));
  try {
    await correrFfmpeg([
      "-nostdin",
      "-loglevel", "error",
      "-i", streamUrl,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "32k",
      "-f", "segment",
      "-segment_time", String(segundosPorParte),
      "-reset_timestamps", "1",
      join(dir, "parte%03d.mp3"),
    ]);

    const nomes = (await readdir(dir)).filter((n) => n.endsWith(".mp3")).sort();
    if (nomes.length === 0) throw new Error("O ffmpeg não produziu nenhum pedaço de áudio.");

    const partes: Buffer[] = [];
    for (const n of nomes) partes.push(await readFile(join(dir, n)));
    return { partes, bytesTotais: partes.reduce((s, p) => s + p.length, 0) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extrairAudio(streamUrl: string): Promise<AudioExtraido> {
  const dir = await mkdtemp(join(tmpdir(), "redacao-audio-"));
  const destino = join(dir, "audio.mp3");

  try {
    await correrFfmpeg([
      "-nostdin",
      "-loglevel", "error",
      "-i", streamUrl,
      "-vn", // sem vídeo: só interessa o som
      "-ac", "1", // mono
      "-ar", "16000", // 16 kHz
      // 32 kbps chega e sobra para voz a 16 kHz mono, e corta o ficheiro a metade: uma
      // conferência de 30 minutos fica em ~7 MB em vez de ~14. O envio de 14 MB rebentou
      // com "Connection error" no primeiro ensaio real, e ficheiro mais pequeno é a
      // primeira defesa contra isso.
      "-b:a", "32k",
      "-y", destino,
    ]);

    const buffer = await readFile(destino);
    return { buffer, nomeFicheiro: "audio.mp3", bytes: buffer.length };
  } finally {
    // Nunca deixar áudio de terceiros no disco, mesmo quando corre mal.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function correrFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let erro = "";
    const temporizador = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("O ffmpeg demorou demasiado a extrair o áudio."));
    }, TIMEOUT_MS);

    p.stderr.on("data", (d) => { erro += d.toString().slice(0, 500); });
    p.on("error", (e) => {
      clearTimeout(temporizador);
      reject(new Error(`Não consegui correr o ffmpeg (${FFMPEG}): ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(temporizador);
      if (code === 0) resolve();
      else reject(new Error(`O ffmpeg falhou (código ${code}): ${erro.trim() || "sem detalhe"}`));
    });
  });
}
