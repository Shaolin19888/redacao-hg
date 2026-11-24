/**
 * Validação heurística de imagem (pura e testável). Verifica requisitos técnicos e
 * editoriais de uma imagem destacada: dimensões, formato, peso, alt text, licença e
 * ausência de conteúdo sintético. Sem url, formato inválido ou imagem sintética são
 * CRÍTICOS (rejeitam); dimensões pequenas, peso elevado ou licença em falta são avisos.
 */

export type ImageIssueSeverity = "critical" | "warning";

export interface ImageQaIssue {
  type: "url" | "formato" | "sintetica" | "dimensoes" | "peso" | "alt" | "licenca";
  severity: ImageIssueSeverity;
  detail: string;
}

export interface ImageQaResult {
  passed: boolean;
  issues: ImageQaIssue[];
}

export interface ImageQaInput {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  license: string | null;
  isSynthetic: boolean;
}

const VALID_FORMATS = ["jpg", "png", "webp"];
const MIN_WIDTH = 1200; // recomendado para imagem destacada / Discover
const MIN_HEIGHT = 630;
const MAX_BYTES = 5_000_000; // 5 MB

export function validateImage(input: ImageQaInput): ImageQaResult {
  const issues: ImageQaIssue[] = [];

  if (!input.url?.trim()) {
    issues.push({ type: "url", severity: "critical", detail: "Imagem sem URL." });
  }
  if (input.isSynthetic) {
    issues.push({ type: "sintetica", severity: "critical", detail: "Imagem sintética não permitida como destaque." });
  }
  if (!input.format || !VALID_FORMATS.includes(input.format)) {
    issues.push({ type: "formato", severity: "critical", detail: `Formato inválido (${input.format ?? "desconhecido"}). Aceite: ${VALID_FORMATS.join(", ")}.` });
  }
  if (!input.alt?.trim() || input.alt.trim().length < 8) {
    issues.push({ type: "alt", severity: "warning", detail: "Alt text em falta ou demasiado curto." });
  }
  if (input.width != null && input.height != null && (input.width < MIN_WIDTH || input.height < MIN_HEIGHT)) {
    issues.push({ type: "dimensoes", severity: "warning", detail: `Dimensões abaixo do recomendado (${input.width}x${input.height}, ideal ≥${MIN_WIDTH}x${MIN_HEIGHT}).` });
  }
  if (input.bytes != null && input.bytes > MAX_BYTES) {
    issues.push({ type: "peso", severity: "warning", detail: `Ficheiro pesado (${Math.round(input.bytes / 1024)} KB, máx ${MAX_BYTES / 1_000_000} MB).` });
  }
  if (!input.license?.trim()) {
    issues.push({ type: "licenca", severity: "warning", detail: "Licença desconhecida — confirmar direitos antes de publicar." });
  }

  return { passed: !issues.some((i) => i.severity === "critical"), issues };
}
