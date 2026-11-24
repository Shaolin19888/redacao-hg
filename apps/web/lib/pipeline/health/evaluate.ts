/**
 * Avaliação pura da saúde do site (sem I/O, testável). Recebe métricas já recolhidas
 * e produz um relatório com um estado por verificação e um estado geral.
 */

export type HealthStatus = "ok" | "warning" | "critical" | "info";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  value?: number | string | null;
}

export interface HealthReport {
  status: Exclude<HealthStatus, "info">; // geral: ok | warning | critical
  checks: HealthCheck[];
}

export interface HealthMetrics {
  wpConfigured: boolean;
  wpReachable: boolean | null; // null se não configurado
  failedRuns: number;
  stuckRuns: number; // runs presos há demasiado tempo num estado automático
  sourcesWithError: number;
  queueWaiting: number;
  queueFailed: number;
  publishedLast7d: number;
  gscConfigured: boolean;
}

// Limiares
const FAILED_CRITICAL = 10;
const QUEUE_BACKLOG_WARN = 50;

export function evaluateHealth(m: HealthMetrics): HealthReport {
  const checks: HealthCheck[] = [];

  // WordPress
  if (!m.wpConfigured) {
    checks.push({ name: "WordPress", status: "info", detail: "Credenciais não configuradas.", value: null });
  } else if (m.wpReachable) {
    checks.push({ name: "WordPress", status: "ok", detail: "API acessível." });
  } else {
    checks.push({ name: "WordPress", status: "critical", detail: "API inacessível." });
  }

  // Runs falhados
  if (m.failedRuns === 0) {
    checks.push({ name: "Runs falhados", status: "ok", detail: "Sem falhas no pipeline.", value: 0 });
  } else if (m.failedRuns >= FAILED_CRITICAL) {
    checks.push({ name: "Runs falhados", status: "critical", detail: `${m.failedRuns} runs falhados.`, value: m.failedRuns });
  } else {
    checks.push({ name: "Runs falhados", status: "warning", detail: `${m.failedRuns} run(s) falhado(s).`, value: m.failedRuns });
  }

  // Runs presos
  checks.push(
    m.stuckRuns > 0
      ? { name: "Runs presos", status: "warning", detail: `${m.stuckRuns} run(s) parado(s) há muito tempo.`, value: m.stuckRuns }
      : { name: "Runs presos", status: "ok", detail: "Nenhum run preso.", value: 0 }
  );

  // Fontes com erro
  checks.push(
    m.sourcesWithError > 0
      ? { name: "Fontes", status: "warning", detail: `${m.sourcesWithError} fonte(s) com erro na última recolha.`, value: m.sourcesWithError }
      : { name: "Fontes", status: "ok", detail: "Fontes sem erros.", value: 0 }
  );

  // Filas
  if (m.queueFailed > 0) {
    checks.push({ name: "Filas", status: "warning", detail: `${m.queueFailed} job(s) na dead-letter, ${m.queueWaiting} em espera.`, value: m.queueFailed });
  } else if (m.queueWaiting > QUEUE_BACKLOG_WARN) {
    checks.push({ name: "Filas", status: "warning", detail: `Backlog elevado: ${m.queueWaiting} jobs em espera.`, value: m.queueWaiting });
  } else {
    checks.push({ name: "Filas", status: "ok", detail: `${m.queueWaiting} em espera, sem falhas.`, value: m.queueWaiting });
  }

  // Publicações recentes (informativo)
  checks.push({ name: "Publicados (7 dias)", status: "info", detail: `${m.publishedLast7d} artigo(s) publicado(s).`, value: m.publishedLast7d });

  // Indexação Google (GSC)
  checks.push(
    m.gscConfigured
      ? { name: "Indexação Google", status: "ok", detail: "GSC configurado." }
      : { name: "Indexação Google", status: "info", detail: "Google Search Console não configurado.", value: null }
  );

  // Estado geral = pior entre os checks accionáveis (info não conta).
  const hasCritical = checks.some((c) => c.status === "critical");
  const hasWarning = checks.some((c) => c.status === "warning");
  const status: HealthReport["status"] = hasCritical ? "critical" : hasWarning ? "warning" : "ok";

  return { status, checks };
}
