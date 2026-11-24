import type { PrismaClient } from "@prisma/client";
import { redirectionAvailable, createRedirect, getDefaultGroupId } from "@/lib/wordpress/redirects";
import { redirectTargetUrl, urlPath } from "./redirect-map";

/**
 * Cria os 301 (via plugin Redirection) para os artigos JÁ apagados (no lixo) de um lote de
 * auditoria, apontando cada um à categoria/tema mais relevante. Idempotente: guarda o destino
 * em revertData e salta os que já têm redirect. Não apaga nada; só acrescenta redirects.
 */

export interface ApplyRedirectsResult {
  available: boolean;
  reason?: string;
  attempted: number;
  created: number;
  failed: number;
  errors: { url: string; error: string }[];
}

export async function applyRedirectsForRun(prisma: PrismaClient, auditRunId: string): Promise<ApplyRedirectsResult> {
  const check = await redirectionAvailable();
  if (!check.ok) {
    return { available: false, reason: check.reason, attempted: 0, created: 0, failed: 0, errors: [] };
  }

  const items = await prisma.auditItem.findMany({
    where: { auditRunId, executionAction: "trash" },
  });

  const result: ApplyRedirectsResult = { available: true, attempted: 0, created: 0, failed: 0, errors: [] };
  const groupId = await getDefaultGroupId(); // uma vez, não por item

  for (const it of items) {
    const revert = (it.revertData as Record<string, unknown> | null) ?? {};
    if (revert.redirectTarget) continue; // já tem redirect
    result.attempted++;

    const target = redirectTargetUrl(it.title);
    const source = urlPath(it.url);
    const r = await createRedirect(source, target, { groupId });
    if (r.ok) {
      await prisma.auditItem.update({
        where: { id: it.id },
        data: { revertData: { ...revert, redirectTarget: target, redirectSource: source } },
      });
      result.created++;
    } else {
      result.failed++;
      result.errors.push({ url: it.url, error: r.error ?? "erro" });
    }
  }

  await prisma.log.create({
    data: {
      action: "audit_redirects",
      details: `Auditoria ${auditRunId}: ${result.created} redirects 301 criados, ${result.failed} falhas (de ${result.attempted}).`,
    },
  });

  return result;
}
