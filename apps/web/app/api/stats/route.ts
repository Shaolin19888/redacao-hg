import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    totalRecolhidas,
    pendentesAprovacao,
    prontoEditor,
    rascunhosWP,
    publicadas,
    workerSetting,
    lastFetch,
  ] = await Promise.all([
    prisma.newsItem.count(),
    prisma.newsItem.count({ where: { status: "texto_gerado" } }),
    prisma.newsItem.count({ where: { status: "guardada" } }),
    prisma.newsItem.count({ where: { status: "rascunho_wp" } }),
    prisma.newsItem.count({ where: { status: "publicada" } }),
    prisma.setting.findUnique({ where: { key: "cron_fetch_enabled" } }),
    prisma.log.findFirst({
      where: { action: "cron_fetch" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    totalRecolhidas,
    pendentesAprovacao,
    prontoEditor,
    rascunhosWP,
    publicadas,
    workerAtivo: workerSetting?.value === "true",
    ultimaRecolha: lastFetch?.createdAt ?? null,
  });
}
