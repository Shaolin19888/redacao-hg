import { prisma } from "@/lib/prisma";
import { testConnection } from "@/lib/wordpress/posts";
import { getQueue } from "../queues/register";
import { QUEUE_NAMES } from "../queues/definitions";
import { evaluateHealth, type HealthMetrics, type HealthReport } from "./evaluate";

/**
 * Recolhe as métricas de saúde (WordPress, pipeline, fontes, filas, publicações) e
 * grava um SiteHealthReport. Chamado sob agenda (worker) e a pedido (API).
 */

// Runs num estado automático (não humano/terminal) há mais de N horas = presos.
const STUCK_HOURS = 6;
const AUTOMATIC_STATES = [
  "COLLECTED", "DEDUP_OK", "RELEVANT", "FACTS_EXTRACTED", "FACTS_QA_OK",
  "WRITTEN", "EDITORIAL_QA_OK", "SEO_QA_OK", "IMAGE_READY", "IMAGE_QA_OK",
  "APPROVED_ALL", "SOCIAL_DRAFTED", "SOCIAL_QA_OK",
] as const;

async function gatherMetrics(): Promise<HealthMetrics> {
  const wpConfigured = !!(process.env.WORDPRESS_URL && process.env.WORDPRESS_USER && process.env.WORDPRESS_APP_PASSWORD);
  let wpReachable: boolean | null = null;
  if (wpConfigured) {
    try {
      await testConnection();
      wpReachable = true;
    } catch {
      wpReachable = false;
    }
  }

  const stuckSince = new Date(Date.now() - STUCK_HOURS * 3600 * 1000);
  const [failedRuns, stuckRuns, sourcesWithError, publishedLast7d] = await Promise.all([
    prisma.pipelineRun.count({ where: { state: "FAILED" } }),
    prisma.pipelineRun.count({ where: { state: { in: [...AUTOMATIC_STATES] }, updatedAt: { lt: stuckSince } } }),
    prisma.source.count({ where: { lastError: { not: null }, active: true } }),
    prisma.wpDraft.count({ where: { publishedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } }),
  ]);

  // Contadores das filas BullMQ (agregado de todas).
  let queueWaiting = 0;
  let queueFailed = 0;
  try {
    const counts = await Promise.all(QUEUE_NAMES.map((n) => getQueue(n).getJobCounts("waiting", "failed", "delayed")));
    for (const c of counts) {
      queueWaiting += (c.waiting ?? 0) + (c.delayed ?? 0);
      queueFailed += c.failed ?? 0;
    }
  } catch {
    // Redis indisponível: deixa a zero (o check de filas reportará OK; WP/pipeline cobrem o resto).
  }

  const gscConfigured = !!(process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET && process.env.GSC_REFRESH_TOKEN);

  return {
    wpConfigured,
    wpReachable,
    failedRuns,
    stuckRuns,
    sourcesWithError,
    queueWaiting,
    queueFailed,
    publishedLast7d,
    gscConfigured,
  };
}

export async function runSiteHealth(): Promise<HealthReport & { id: string }> {
  const metrics = await gatherMetrics();
  const report = evaluateHealth(metrics);

  const saved = await prisma.siteHealthReport.create({
    data: { status: report.status, checks: report.checks as unknown as object[] },
    select: { id: true },
  });

  await prisma.log.create({
    data: { action: "site_health", details: `Saúde do site: ${report.status.toUpperCase()}` },
  });

  return { id: saved.id, ...report };
}
