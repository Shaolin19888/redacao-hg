import { test } from "node:test";
import assert from "node:assert/strict";
import { previousWeekRange, formatWeekLabel } from "../../lib/pipeline/report/week";
import { costEur, hasPrice, loadPriceTable, __resetPriceCache } from "../../lib/pipeline/report/pricing";
import { formatReport, eur, type WeeklyReportData } from "../../lib/pipeline/report/build-report";

// --- Janela da semana ---

test("previousWeekRange devolve segunda a domingo da semana anterior", () => {
  // Quarta, 15 de julho de 2026.
  const now = new Date(2026, 6, 15, 10, 0, 0);
  const r = previousWeekRange(now);
  // Semana anterior: 6 (seg) a 12 (dom) de julho.
  assert.equal(r.start.getFullYear(), 2026);
  assert.equal(r.start.getMonth(), 6);
  assert.equal(r.start.getDate(), 6);
  assert.equal(r.start.getDay(), 1); // segunda
  assert.equal(r.end.getDate(), 12);
  assert.equal(r.end.getDay(), 0); // domingo
  assert.equal(r.end.getHours(), 23);
  assert.equal(r.end.getMinutes(), 59);
  assert.equal(r.key, "2026-07-06");
});

test("previousWeekRange numa segunda usa a semana imediatamente anterior", () => {
  // Segunda, 13 de julho de 2026 (dia de envio do relatório).
  const now = new Date(2026, 6, 13, 9, 0, 0);
  const r = previousWeekRange(now);
  assert.equal(r.start.getDate(), 6); // segunda anterior
  assert.equal(r.end.getDate(), 12); // domingo anterior
  assert.equal(r.label, "6 a 12 de julho");
});

test("previousWeekRange num domingo ainda aponta para a semana anterior completa", () => {
  // Domingo, 12 de julho de 2026.
  const now = new Date(2026, 6, 12, 23, 0, 0);
  const r = previousWeekRange(now);
  assert.equal(r.start.getDate(), 29); // 29 de junho
  assert.equal(r.start.getMonth(), 5);
  assert.equal(r.end.getDate(), 5); // 5 de julho
  assert.equal(r.end.getMonth(), 6);
});

test("formatWeekLabel omite o mês do início quando é o mesmo mês", () => {
  assert.equal(formatWeekLabel(new Date(2026, 6, 7), new Date(2026, 6, 13)), "7 a 13 de julho");
});

test("formatWeekLabel mostra os dois meses quando a semana cruza o mês", () => {
  assert.equal(formatWeekLabel(new Date(2026, 6, 28), new Date(2026, 7, 3)), "28 de julho a 3 de agosto");
});

// --- Preços ---

test("costEur aplica a fórmula tokens×preço com conversão para euro", () => {
  const table = { usdToEur: 0.9, modelos: { m: { inputUsdPerMillion: 10, outputUsdPerMillion: 20 } } };
  // 1M in × 10 + 0.5M out × 20 = 10 + 10 = 20 USD; ×0.9 = 18 EUR.
  assert.equal(costEur("m", 1_000_000, 500_000, { table }), 18);
});

test("modelo sem preço custa 0 e é sinalizável", () => {
  const table = { usdToEur: 1, modelos: {} };
  assert.equal(costEur("desconhecido", 1_000_000, 1_000_000, { table }), 0);
  assert.equal(hasPrice("desconhecido", table), false);
});

test("a tabela de preços carrega os modelos reais do sistema", () => {
  __resetPriceCache();
  const table = loadPriceTable();
  assert.ok(hasPrice("claude-opus-4-8", table), "opus devia ter preço");
  assert.ok(hasPrice("claude-sonnet-4-5", table), "sonnet 4.5 devia ter preço");
  assert.ok(table.usdToEur > 0 && table.usdToEur <= 1.5);
});

// --- Formatação ---

function baseData(over: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    label: "7 a 13 de julho",
    approved: 61,
    rejected: 23,
    partial: 0,
    decided: 84,
    approvalRate: 61 / 84,
    published: 58,
    costByModel: [
      { model: "claude-opus-4-8", tokensIn: 100, tokensOut: 100, eur: 4.1, priced: true },
      { model: "claude-sonnet-4-5", tokensIn: 100, tokensOut: 100, eur: 1.6, priced: true },
    ],
    costByStage: [
      { label: "Escrita", calls: 12, eur: 4.1 },
      { label: "Triagem", calls: 900, eur: 1.6 },
    ],
    totalCostEur: 5.7,
    avgCostPerApprovedEur: 5.7 / 61,
    unpricedModels: [],
    avgRevisionRounds: 1.4,
    ...over,
  };
}

test("o relatório discrimina o custo por etapa, com o número de chamadas", () => {
  const out = formatReport(baseData());
  assert.match(out, /Por etapa:/);
  assert.match(out, /- Escrita: 4,10 euros \(12 chamadas\)/);
  assert.match(out, /- Triagem: 1,60 euros \(900 chamadas\)/);
});

test("eur formata com vírgula e duas casas", () => {
  assert.equal(eur(6.4), "6,40");
  assert.equal(eur(0.1), "0,10");
});

test("formatReport segue o formato do exemplo da spec", () => {
  const out = formatReport(baseData());
  assert.match(out, /Relatório semanal da Redação HG/);
  assert.match(out, /Semana de 7 a 13 de julho/);
  assert.match(out, /Notícias decididas: 84/);
  assert.match(out, /Aprovadas: 61/);
  assert.match(out, /Recusadas: 23/);
  assert.match(out, /Taxa de aprovação: 73%/); // 61/84 = 0.726 → 73%
  assert.match(out, /Publicadas no site: 58/);
  assert.match(out, /- claude-opus-4-8: 4,10 euros/);
  assert.match(out, /Qualidade: 1,4 voltas de revisão em média por peça/);
});

test("formatReport não divide por zero quando não houve decisões", () => {
  const out = formatReport(
    baseData({ approved: 0, rejected: 0, decided: 0, approvalRate: null, avgCostPerApprovedEur: null }),
  );
  assert.match(out, /Taxa de aprovação: sem decisões/);
  assert.match(out, /Custo médio por notícia aprovada: sem aprovadas/);
});

test("formatReport avisa quando há modelos sem preço na tabela", () => {
  const out = formatReport(
    baseData({
      unpricedModels: ["modelo-novo-x"],
      costByModel: [{ model: "modelo-novo-x", tokensIn: 100, tokensOut: 100, eur: 0, priced: false }],
    }),
  );
  assert.match(out, /Modelos sem preço na tabela/);
  assert.match(out, /modelo-novo-x/);
});

test("formatReport omite a linha de qualidade quando não há voltas de revisão", () => {
  const out = formatReport(baseData({ avgRevisionRounds: null }));
  assert.doesNotMatch(out, /Qualidade:/);
});
