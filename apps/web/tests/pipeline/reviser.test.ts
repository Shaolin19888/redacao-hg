import { test } from "node:test";
import assert from "node:assert/strict";
import { isReviserApproved, HARD_FAIL_LABELS } from "../../lib/pipeline/editorial/reviser-decision";
import { getDoctrine, doctrineLoadedFromFile, __resetDoctrineCache } from "../../lib/pipeline/editorial/doctrine";
import { buildWriterSystem, buildReviserSystem, buildCorrectionUser } from "../../lib/pipeline/llm/prompts";

// --- Regra de decisão do Revisor (PROMPTS-INTERNOS §H) ---

test("APROVADO sem falhas é aprovado", () => {
  assert.equal(isReviserApproved("APROVADO", []), true);
});

test("falhas duras (título cita órgão, engana, rumor, invenção, lista negra) reprovam sempre", () => {
  for (const label of HARD_FAIL_LABELS) {
    assert.equal(isReviserApproved("APROVADO", [label]), false, `${label} devia reprovar`);
  }
});

test("falha menos crítica com estado APROVADO mantém-se aprovado", () => {
  assert.equal(isReviserApproved("APROVADO", ["tres-niveis"]), true);
  assert.equal(isReviserApproved("APROVADO", ["portugues", "arbitragem-sem-analise"]), true);
});

test("título que cita um órgão reprova mesmo com o modelo a dizer APROVADO", () => {
  assert.equal(isReviserApproved("APROVADO", [], { tituloCitaOrgao: true }), false);
});

test("REPROVADO é sempre reprovado, mesmo sem falhas listadas", () => {
  assert.equal(isReviserApproved("REPROVADO", []), false);
});

// --- Doutrina como fonte única ---

test("a doutrina é lida do ficheiro ESTILO-EDITORIAL-HG.md, não do fallback", () => {
  __resetDoctrineCache();
  const d = getDoctrine();
  assert.ok(doctrineLoadedFromFile(), "devia carregar do ficheiro");
  assert.ok(d.includes("estrela polar"), "doutrina devia conter a estrela polar");
  assert.ok(d.toLowerCase().includes("três níveis") || d.toLowerCase().includes("tres niveis"));
});

test("se o ficheiro não existir, usa o fallback embutido (nunca fica sem doutrina)", () => {
  const prev = process.env.EDITORIAL_DOCTRINE_PATH;
  process.env.EDITORIAL_DOCTRINE_PATH = "/caminho/que/nao/existe/estilo.md";
  __resetDoctrineCache();
  const d = getDoctrine();
  assert.ok(d.length > 200, "fallback devia ter conteúdo");
  assert.ok(d.toLowerCase().includes("autoridade"), "fallback traz a estrela polar");
  // Repõe o estado para os outros testes.
  if (prev === undefined) delete process.env.EDITORIAL_DOCTRINE_PATH;
  else process.env.EDITORIAL_DOCTRINE_PATH = prev;
  __resetDoctrineCache();
});

// --- Injecção da doutrina nos prompts ---

test("os prompts de escrita e de revisão injectam a doutrina e o método dos três níveis", () => {
  __resetDoctrineCache();
  const writer = buildWriterSystem();
  const reviser = buildReviserSystem();
  assert.ok(writer.includes("estrela polar"), "writer devia incluir a doutrina");
  assert.ok(writer.toLowerCase().includes("três níveis"), "writer devia referir os três níveis");
  assert.ok(reviser.includes("estrela polar"), "revisor devia incluir a doutrina");
  assert.ok(/checklist/i.test(reviser), "revisor devia trazer a checklist");
  assert.ok(reviser.includes("REPROVADO"), "revisor devia devolver estado");
});

test("o prompt de correção inclui as falhas e as correções pedidas", () => {
  const u = buildCorrectionUser({
    title: "Título de teste",
    body: "Corpo do artigo de teste.",
    falhas: ["titulo-cita-orgao", "lista-negra"],
    correcoes: ["Torna o título honesto.", "Remove a indignação sem análise."],
  });
  assert.ok(u.includes("Torna o título honesto."));
  assert.ok(u.includes("Remove a indignação sem análise."));
  assert.ok(u.includes("titulo-cita-orgao, lista-negra"));
  assert.ok(u.includes("Corpo do artigo de teste."));
});
