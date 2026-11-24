import type { PrismaClient } from "@prisma/client";
import { previousWeekRange } from "./week";
import { buildWeeklyReport, formatReport, type WeeklyReportData } from "./build-report";
import { sendReportMessage } from "../telegram/client";

/**
 * Orquestra o relatório semanal: calcula a semana anterior, evita reenvios (idempotência),
 * envia para o Telegram e regista no Log. Usado pelo cron de segunda E pela recuperação no
 * arranque do worker (se a segunda foi perdida com o PC desligado). Ver docs/RELATORIO-SEMANAL.md.
 */

const LAST_SENT_KEY = "report_weekly_last_sent"; // guarda a chave da semana já enviada (data da segunda)

export interface WeeklyReportResult {
  ran: boolean; // false quando saltou por já ter sido enviado
  reason?: string;
  weekKey: string;
  weekLabel: string;
  sent: boolean;
  simulated: boolean;
  chatId: string | null;
  error?: string;
  data?: WeeklyReportData;
  text?: string;
}

async function getSetting(prisma: PrismaClient, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

async function setSetting(prisma: PrismaClient, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/**
 * Corre o relatório da semana anterior. Idempotente: se a mesma semana já foi enviada, salta
 * (a não ser force). Marca como enviada quando o envio corre (real ou simulado); se o envio
 * real falhar com erro, NÃO marca, para tentar de novo no próximo arranque/cron.
 */
export async function runWeeklyReport(
  prisma: PrismaClient,
  opts: { now?: Date; force?: boolean; preview?: boolean } = {},
): Promise<WeeklyReportResult> {
  const now = opts.now ?? new Date();
  const range = previousWeekRange(now);

  const data = await buildWeeklyReport(prisma, range);
  const text = formatReport(data);

  // Preview: constrói mas não envia nem marca (para verificação segura).
  if (opts.preview) {
    return { ran: false, reason: "preview", weekKey: range.key, weekLabel: range.label, sent: false, simulated: false, chatId: null, data, text };
  }

  const last = await getSetting(prisma, LAST_SENT_KEY);
  if (last === range.key && !opts.force) {
    return { ran: false, reason: "ja-enviado", weekKey: range.key, weekLabel: range.label, sent: false, simulated: false, chatId: null, data, text };
  }

  const send = await sendReportMessage(text);

  if (send.error) {
    // Falha real de envio: não marca, regista o erro, tenta no próximo ciclo.
    await prisma.log.create({
      data: { action: "weekly_report_error", details: `Semana ${range.label}: erro ao enviar — ${send.error}` },
    }).catch(() => {});
    return { ran: true, weekKey: range.key, weekLabel: range.label, sent: false, simulated: false, chatId: send.chatId, error: send.error, data, text };
  }

  // Enviado (ou simulado por falta de config): marca e regista.
  await setSetting(prisma, LAST_SENT_KEY, range.key);
  await prisma.log.create({
    data: {
      action: "weekly_report_sent",
      details: `Semana ${range.label}: ${data.decided} decididas, ${data.approved} aprovadas, ${data.published} publicadas, custo ${data.totalCostEur.toFixed(2)}€${send.simulated ? " (simulado, Telegram não configurado)" : ""}`,
    },
  }).catch(() => {});

  return { ran: true, weekKey: range.key, weekLabel: range.label, sent: send.sent, simulated: send.simulated, chatId: send.chatId, data, text };
}
