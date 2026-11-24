import { prisma } from "@/lib/prisma";
import { validateImage } from "./qa-heuristic";
import { uploadMediaFromUrl } from "@/lib/wordpress/media";
import { updatePostFeaturedMedia } from "@/lib/wordpress/posts";

/**
 * Aplica uma imagem sugerida pelo editor (por resposta no Telegram: foto ou URL do banco).
 * Substitui a ImageAsset do run, valida-a e regista um QAReport. Não muda o estado do
 * pipeline — o run continua a aguardar a mesma aprovação, agora com a nova imagem.
 */

export interface SuggestedImage {
  url: string;
  source: "user" | "bank";
  width?: number | null;
  height?: number | null;
  format?: string | null;
}

export interface SuggestionResult {
  ok: boolean;
  qaPassed: boolean;
  issues: string[];
}

function formatFromUrl(url: string): string | null {
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : null;
}

export async function applyImageSuggestion(pipelineRunId: string, img: SuggestedImage): Promise<SuggestionResult> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { article: { select: { title: true, slug: true } }, image: true, wpDraft: true },
  });
  if (!run) return { ok: false, qaPassed: false, issues: ["Run não encontrado."] };

  const alt = run.image?.alt ?? run.article?.title ?? "Imagem do artigo";

  // Carrega a imagem para a media do WordPress JÁ (não só quando o post existe). O link do
  // Telegram é temporário (~1h), tem o token do bot embutido e o Telegram recusa reenviá-lo
  // como foto no cartão. Guardamos o URL PERMANENTE do WordPress + o wpMediaId, que a
  // publicação reutiliza directamente como imagem destacada (sem depender do link efémero).
  // Só em modo WP real; em simulado mantém-se o link do Telegram (não vai ao site).
  const wpReal =
    !!(process.env.WORDPRESS_URL && process.env.WORDPRESS_USER && process.env.WORDPRESS_APP_PASSWORD) &&
    (await prisma.setting.findUnique({ where: { key: "pipeline_wp_mode" } }))?.value === "real";

  let storedUrl = img.url;
  let wpMediaId: number | null = run.image?.wpMediaId ?? null;
  if (wpReal) {
    const media = await uploadMediaFromUrl(img.url, run.article?.slug || run.article?.title || "imagem", alt);
    if (media) {
      storedUrl = media.url;
      wpMediaId = media.id;
      if (run.wpDraft?.wpPostId) await updatePostFeaturedMedia(run.wpDraft.wpPostId, media.id).catch(() => {});
    }
  }

  const format = img.format ?? formatFromUrl(storedUrl);

  const validation = validateImage({
    url: storedUrl,
    alt,
    width: img.width ?? null,
    height: img.height ?? null,
    bytes: null,
    format,
    license: img.source === "bank" ? "banco interno" : "sugerida pelo editor",
    isSynthetic: false,
  });

  await prisma.imageAsset.upsert({
    where: { pipelineRunId },
    update: {
      source: img.source,
      url: storedUrl,
      wpMediaId,
      alt,
      width: img.width ?? null,
      height: img.height ?? null,
      format,
      license: img.source === "bank" ? "banco interno" : "sugerida pelo editor",
      attribution: img.source === "bank" ? "Banco de imagens do site" : "Sugerida pelo editor",
      isSynthetic: false,
      qaStatus: validation.passed ? "ok" : "rejected",
    },
    create: {
      pipelineRunId,
      source: img.source,
      url: storedUrl,
      wpMediaId,
      alt,
      width: img.width ?? null,
      height: img.height ?? null,
      format,
      license: img.source === "bank" ? "banco interno" : "sugerida pelo editor",
      qaStatus: validation.passed ? "ok" : "rejected",
    },
  });

  await prisma.qAReport.create({
    data: {
      pipelineRunId,
      stage: "image",
      agent: "IMAGE_QA",
      passed: validation.passed,
      issues: validation.issues as unknown as object[],
    },
  });

  return { ok: true, qaPassed: validation.passed, issues: validation.issues.map((i) => i.detail) };
}
