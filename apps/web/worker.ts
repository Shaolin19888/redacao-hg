import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { fetchAllSources } from "./lib/sources/fetcher";
import { startPipelineWorkers } from "./lib/pipeline/queues/worker-runner";
import { runSiteHealth } from "./lib/pipeline/health/run";
import { resendMissingApprovals } from "./lib/pipeline/approval/notify";
import { collectAllPipelineSources } from "./lib/pipeline/agents/source-manager";
import { runWeeklyReport } from "./lib/pipeline/report/run";
import { VigiaRecolha, type Veredicto } from "./lib/pipeline/health/watchdog";

const prisma = new PrismaClient();

async function getSetting(key: string, fallback: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? process.env[key.toUpperCase()] ?? fallback;
}

async function runFetch() {
  const enabled = await getSetting("cron_fetch_enabled", "false");
  if (enabled !== "true") return;

  console.log(`[worker] ${new Date().toISOString()} — A recolher notícias...`);
  try {
    const results = await fetchAllSources();
    const total = results.reduce((acc, r) => acc + r.items.length, 0);
    const errors = results.filter((r) => r.error).map((r) => r.error);
    console.log(`[worker] Recolhidos ${total} items.${errors.length ? ` Erros: ${errors.join(", ")}` : ""}`);

    await prisma.log.create({
      data: {
        action: "cron_fetch",
        details: `Recolha automática: ${total} itens novos${errors.length ? ` | Erros: ${errors.join(", ")}` : ""}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Erro na recolha: ${msg}`);
    await prisma.log.create({
      data: { action: "cron_fetch_error", details: `Erro na recolha automática: ${msg}` },
    });
  }
}

let pipelineCollectInFlight = false;

/**
 * Vigia da recolha. Se falharem TODAS as fontes vários ciclos seguidos, o processo está
 * avariado (tipicamente a rede encravada depois de o Mac adormecer) e a cura é nascer de
 * novo — o launchd tem KeepAlive e levanta-o em ~20 segundos.
 */
const vigia = new VigiaRecolha();

/** Regista o veredicto e, se for caso disso, sai para que o launchd relance o worker. */
async function aplicarVeredicto(v: Veredicto) {
  if (!v.motivo) return;
  console.error(`[worker] ${v.motivo}`);
  await prisma.log
    .create({
      data: {
        action: v.desistir ? "worker_autoreinicio" : "pipeline_collect_falha_total",
        details: v.motivo,
      },
    })
    .catch(() => {});
  if (!v.desistir) return;
  // Dar tempo ao registo de ir para o disco antes de fechar.
  setTimeout(() => process.exit(1), 500);
}

/**
 * Recolha automática do PIPELINE editorial (distinta do radar antigo runFetch, que
 * alimenta o NewsItem). Corre as fontes reais, respeitando a cadência de cada uma, e
 * arranca um run por candidato novo. Cada candidato passa pela Relevância (Claude) — ou
 * seja, tem custo: controlável pelo Setting `pipeline_collect_enabled` (default off).
 */
async function runPipelineCollect() {
  const enabled = await getSetting("pipeline_collect_enabled", "false");
  if (enabled !== "true") return;
  if (pipelineCollectInFlight) {
    console.log("[worker] Recolha do pipeline ainda a decorrer — salto este ciclo.");
    return;
  }

  pipelineCollectInFlight = true;
  try {
    const { results, skipped } = await collectAllPipelineSources();
    const created = results.reduce((a, r) => a + r.created, 0);
    const runs = results.reduce((a, r) => a + r.runsStarted, 0);
    const errors = results.filter((r) => r.error).map((r) => `${r.sourceId}: ${r.error}`);
    const video = results.reduce((a, r) => a + (r.skippedVideo ?? 0), 0);
    console.log(
      `[worker] Recolha pipeline: ${created} candidatos novos, ${runs} runs` +
        `${video ? `, ${video} página(s) de vídeo ignorada(s)` : ""}` +
        `${skipped.length ? ` (${skipped.length} fonte(s) ainda dentro da cadência)` : ""}` +
        `${errors.length ? ` | Erros: ${errors.join("; ")}` : ""}`
    );
    await prisma.log.create({
      data: {
        action: "pipeline_collect_cron",
        details: `${created} candidatos novos, ${runs} runs iniciados${errors.length ? ` | Erros: ${errors.join("; ")}` : ""}`,
      },
    });

    await aplicarVeredicto(vigia.registar({ tentadas: results.length, falhadas: errors.length }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Erro na recolha do pipeline: ${msg}`);
    await prisma.log.create({ data: { action: "pipeline_collect_cron_error", details: msg } });
    await aplicarVeredicto(vigia.registarExcepcao());
  } finally {
    pipelineCollectInFlight = false;
  }
}

async function start() {
  // Workers do pipeline editorial (BullMQ). Handlers ligados incrementalmente por fase.
  startPipelineWorkers();

  const interval = await getSetting("cron_fetch_interval", "15");
  const minutes = Math.max(5, parseInt(interval));

  console.log(`[worker] Radar automático activo — intervalo: ${minutes} minutos`);

  // Executar imediatamente ao arrancar se estiver activo
  await runFetch();

  cron.schedule(`*/${minutes} * * * *`, runFetch);

  // Recolha automática do PIPELINE (Setting pipeline_collect_enabled). O tick verifica
  // as fontes; cada uma só é recolhida quando a sua cadência (frequencyMinutes) o permite.
  // Não corre imediatamente ao arrancar — evita um pico a cada reinício do worker.
  const collectInterval = Math.max(5, parseInt(await getSetting("pipeline_collect_interval", "15")));
  console.log(`[worker] Recolha automática do pipeline — tick a cada ${collectInterval} min (activa via Setting pipeline_collect_enabled).`);
  cron.schedule(`*/${collectInterval} * * * *`, runPipelineCollect);

  // Auto-reparação: reenvia pedidos de aprovação que não chegaram ao Telegram (a cada 2 min).
  cron.schedule("*/2 * * * *", async () => {
    try {
      const n = await resendMissingApprovals();
      if (n > 0) console.log(`[worker] Reenviados ${n} pedido(s) de aprovação em falta.`);
    } catch (err) {
      console.error("[worker] Erro no reenvio de aprovações:", err instanceof Error ? err.message : err);
    }
  });


  // Site Health: verificação de saúde a cada 6 horas (Fase 8).
  cron.schedule("0 */6 * * *", async () => {
    try {
      const report = await runSiteHealth();
      console.log(`[worker] Saúde do site: ${report.status.toUpperCase()}`);
    } catch (err) {
      console.error("[worker] Erro no site health:", err instanceof Error ? err.message : err);
    }
  });

  // Relatório semanal: segunda às 9h de Lisboa. Idempotente (não duplica).
  cron.schedule("0 9 * * 1", runWeeklyReportSafe, { timezone: "Europe/Lisbon" });
  // Recuperação: se a segunda foi perdida (PC desligado às 9h), envia assim que o worker
  // arrancar. runWeeklyReport é idempotente, por isso é seguro chamar sempre no arranque.
  await runWeeklyReportSafe();
}

/** Corre o relatório semanal com protecção de erros e log legível. */
async function runWeeklyReportSafe() {
  try {
    const r = await runWeeklyReport(prisma);
    if (!r.ran) {
      console.log(`[worker] Relatório semanal (${r.weekLabel}): saltado (${r.reason}).`);
    } else if (r.error) {
      console.error(`[worker] Relatório semanal (${r.weekLabel}): falha no envio — ${r.error}`);
    } else {
      console.log(`[worker] Relatório semanal (${r.weekLabel}) enviado${r.simulated ? " (simulado)" : ""}.`);
    }
  } catch (err) {
    console.error("[worker] Erro no relatório semanal:", err instanceof Error ? err.message : err);
  }
}

start().catch((e) => {
  console.error("[worker] Falha ao arrancar:", e);
  process.exit(1);
});
