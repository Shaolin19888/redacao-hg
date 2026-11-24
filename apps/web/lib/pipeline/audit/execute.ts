import type { PrismaClient } from "@prisma/client";
import { trashPost } from "@/lib/wordpress/posts";

/**
 * Execução da poda (docs/AUDITORIA-CONTEUDO.md §"Aprovação humana" e §"Salvaguardas").
 * SÓ actua nos itens que o Hugo marcou ACCEPT com decisão de APAGAR. Move para o LIXO do
 * WordPress (reversível, nunca em definitivo), guarda os dados para reverter e regista no Log.
 * Corre por lotes. Idempotente: itens já executados são saltados.
 */

export interface ExecuteResult {
  attempted: number;
  trashed: number;
  failed: number;
  skipped: number;
  errors: { wpPostId: number; title: string; error: string }[];
}

export async function executeAuditDeletions(
  prisma: PrismaClient,
  auditRunId: string,
  opts: { batchSize?: number; dryRun?: boolean } = {},
): Promise<ExecuteResult> {
  const batchSize = opts.batchSize ?? 200;

  // Só apaga o que o humano ACEITOU e a sugestão é DELETE, e ainda não foi executado.
  const items = await prisma.auditItem.findMany({
    where: { auditRunId, suggestedDecision: "DELETE", humanDecision: "ACCEPT", executedAt: null },
    take: batchSize,
  });

  const result: ExecuteResult = { attempted: items.length, trashed: 0, failed: 0, skipped: 0, errors: [] };

  if (opts.dryRun) return result;

  for (const it of items) {
    const r = await trashPost(it.wpPostId);
    if (r.ok) {
      await prisma.auditItem.update({
        where: { id: it.id },
        data: {
          executedAt: new Date(),
          executionAction: "trash",
          revertData: { previousStatus: r.previousStatus ?? "publish", url: it.url, wpPostId: it.wpPostId },
        },
      });
      result.trashed++;
    } else {
      result.failed++;
      result.errors.push({ wpPostId: it.wpPostId, title: it.title, error: r.error ?? "erro" });
    }
  }

  await prisma.log.create({
    data: {
      action: "audit_execute",
      details: `Auditoria ${auditRunId}: ${result.trashed} para o lixo, ${result.failed} falhas (de ${result.attempted} aprovados). Reversível no WordPress.`,
    },
  });

  return result;
}
