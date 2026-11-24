/**
 * Encontra o vídeo dentro da página da conferência e descobre onde está o áudio.
 *
 * Cadeia: página oficial → iframe do Vimeo → configuração do reprodutor → stream HLS.
 * A configuração do Vimeo exige o cabeçalho de referência da página que embebe o vídeo,
 * senão devolve 403. É o ponto mais frágil de toda a funcionalidade: se o Vimeo mudar, parte
 * — e nesse caso tem de falhar com mensagem clara, nunca em silêncio.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";

export interface VideoResolvido {
  /** Endereço do stream de onde o ffmpeg extrai o áudio. */
  streamUrl: string;
  /** Endereço público do vídeo, guardado para auditoria. */
  mediaUrl: string;
  duracaoSeg: number;
  titulo?: string;
}

async function obter(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, ...(referer ? { referer } : {}) },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return res.text();
}

/** Extrai o id do vídeo Vimeo embebido na página. */
export function extrairIdVimeo(html: string): string | null {
  const m = html.match(/player\.vimeo\.com\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Lê a configuração do reprodutor Vimeo e devolve o stream e a duração.
 * Exportada à parte para poder ser testada com um JSON de exemplo.
 */
export function lerConfigVimeo(config: unknown): { streamUrl: string; duracaoSeg: number; titulo?: string } {
  const c = config as {
    video?: { duration?: number; title?: string };
    request?: { files?: { hls?: { cdns?: Record<string, { url?: string }>; default_cdn?: string }; progressive?: { url?: string; quality?: string }[] } };
  };

  const duracaoSeg = Math.round(c.video?.duration ?? 0);
  const titulo = c.video?.title;

  // Preferência: progressivo (ficheiro directo, mais simples). Fallback: HLS.
  const prog = c.request?.files?.progressive ?? [];
  if (prog.length > 0 && prog[0].url) return { streamUrl: prog[0].url, duracaoSeg, titulo };

  const hls = c.request?.files?.hls;
  const cdn = hls?.default_cdn && hls.cdns?.[hls.default_cdn]?.url;
  if (cdn) return { streamUrl: cdn, duracaoSeg, titulo };

  const primeiro = Object.values(hls?.cdns ?? {})[0]?.url;
  if (primeiro) return { streamUrl: primeiro, duracaoSeg, titulo };

  throw new Error("A configuração do Vimeo não trouxe nenhum stream utilizável.");
}

/** Resolve o vídeo de uma página de conferência até ao stream de áudio. */
export async function resolverVideo(paginaUrl: string): Promise<VideoResolvido> {
  const html = await obter(paginaUrl);
  const id = extrairIdVimeo(html);
  if (!id) throw new Error("Não encontrei nenhum vídeo Vimeo nesta página.");

  const mediaUrl = `https://player.vimeo.com/video/${id}`;
  // O referer TEM de ser a página que embebe, senão o Vimeo recusa.
  const raw = await obter(`${mediaUrl}/config`, paginaUrl);
  const { streamUrl, duracaoSeg, titulo } = lerConfigVimeo(JSON.parse(raw));
  return { streamUrl, mediaUrl, duracaoSeg, titulo };
}
