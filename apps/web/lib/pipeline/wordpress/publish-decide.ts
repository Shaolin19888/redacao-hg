/**
 * Decisão pura sobre como publicar (testável sem I/O). Determina se a publicação
 * é real (há credenciais, modo real e um post real no WordPress) ou simulada.
 */

export interface PublishContext {
  wpMode: "real" | "simulado";
  wpPostId: number | null;
}

export type PublishAction = "real" | "simulado";

export function resolvePublishAction(ctx: PublishContext): PublishAction {
  // Só publica a sério se estiver em modo real E existir um post real criado no WordPress.
  if (ctx.wpMode === "real" && ctx.wpPostId != null) return "real";
  return "simulado";
}
