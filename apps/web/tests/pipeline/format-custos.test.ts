import { test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, formatApprovalSummary } from "../../lib/pipeline/telegram/format";

test("excerpt PRESERVA as quebras entre parágrafos (era o que estragava as edições)", () => {
  const corpo = "Primeiro parágrafo com algum texto.\n\nSegundo parágrafo.\n\nTerceiro e último.";
  const out = excerpt(corpo, 3200);
  assert.equal(out.split(/\n\n/).length, 3, "devia manter os 3 parágrafos");
  assert.ok(out.includes("Primeiro parágrafo"));
  assert.ok(out.includes("Terceiro e último"));
});

test("excerpt colapsa espaços e quebras soltas DENTRO do parágrafo", () => {
  const corpo = "Uma frase\nquebrada ao   meio.\n\nOutro parágrafo.";
  const out = excerpt(corpo, 3200);
  assert.ok(out.startsWith("Uma frase quebrada ao meio."), `obteve: ${out.slice(0, 40)}`);
  assert.equal(out.split(/\n\n/).length, 2);
});

test("excerpt continua a cortar ao limite", () => {
  const out = excerpt("palavra ".repeat(200), 100);
  assert.ok(out.length <= 101, `comprimento ${out.length}`);
  assert.ok(out.endsWith("…"));
});

test("o cartão mostra o custo de API quando existe", () => {
  const com = formatApprovalSummary({
    title: "T", bodyExcerpt: "corpo", sourceName: "SL Benfica", sourceUrl: "",
    wordCount: 250, category: "Benfica", qaWarnings: [], wpSimulated: false, costEur: 0.0432,
  });
  assert.match(com, /0,043 €/);
  const sem = formatApprovalSummary({
    title: "T", bodyExcerpt: "corpo", sourceName: "SL Benfica", sourceUrl: "",
    wordCount: 250, category: "Benfica", qaWarnings: [], wpSimulated: false, costEur: 0,
  });
  assert.doesNotMatch(sem, /€/);
});

test("o cartão discrimina o custo por etapa e marca as repetições", () => {
  const out = formatApprovalSummary({
    title: "T", bodyExcerpt: "corpo", sourceName: "SL Benfica", sourceUrl: "",
    wordCount: 250, category: "Benfica", qaWarnings: [], wpSimulated: false, costEur: 0.0432,
    costSteps: [
      { label: "Escrita", calls: 2, eur: 0.03 },
      { label: "Revisão", calls: 1, eur: 0.0132 },
      { label: "Imagem", calls: 1, eur: 0 }, // etapa sem custo não polui o cartão
    ],
  });
  assert.match(out, /Escrita ×2: 0,030 €/);
  assert.match(out, /Revisão: 0,013 €/);
  assert.doesNotMatch(out, /Imagem/);
});
