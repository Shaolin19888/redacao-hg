import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFactsHeuristic, splitSentences } from "../../lib/pipeline/facts/extract-heuristic";
import { classifyFact, classifyFacts } from "../../lib/pipeline/facts/qa-heuristic";
import { composeArticleHeuristic } from "../../lib/pipeline/writer/compose-heuristic";

// ── Fact Extraction ──

test("splitSentences separa frases", () => {
  const s = splitSentences("O Benfica venceu. O Porto empatou. O Sporting perdeu.");
  assert.equal(s.length, 3);
});

test("extractFactsHeuristic produz factos e infere tipos", () => {
  const facts = extractFactsHeuristic(
    "Benfica prepara proposta pelo médio do River Plate",
    "O clube segue o jogador de 22 anos.",
    "O Benfica prepara uma proposta pelo médio. O jogador sofreu uma lesão na época passada."
  );
  assert.ok(facts.length >= 2, "devia extrair vários factos");
  assert.ok(facts.some((f) => f.type === "TRANSFER"), "devia detectar facto de mercado");
  assert.ok(facts.some((f) => f.type === "INJURY"), "devia detectar facto de lesão");
});

// ── Fact QA (conservador) ──

test("Fact QA não confirma RUMOR de mercado de fonte única", () => {
  const d = classifyFact({ id: "1", type: "TRANSFER", confidence: 0.9, sourceCount: 1, text: "O Benfica prepara uma proposta pelo médio, segundo a imprensa" });
  assert.equal(d.status, "DOUBTFUL");
  assert.ok(d.sensitive);
});

test("Fact QA CONFIRMA anúncio oficial de renovação (afinação regra 4)", () => {
  const d = classifyFact({ id: "1", type: "TRANSFER", confidence: 0.7, sourceCount: 1, text: "O FC Porto oficializou a renovação do guarda-redes até 2029" });
  assert.equal(d.status, "CONFIRMED");
  assert.ok(!d.sensitive, "anúncio oficial não é rumor sensível");
});

test("Fact QA CONFIRMA contratação oficial anunciada pelo clube", () => {
  const d = classifyFact({ id: "1", type: "TRANSFER", confidence: 0.6, sourceCount: 1, text: "O Benfica anunciou a contratação do avançado, que é reforço para a próxima época" });
  assert.equal(d.status, "CONFIRMED");
});

test("Fact QA nunca confirma lesão de fonte única (rumor)", () => {
  const d = classifyFact({ id: "1", type: "INJURY", confidence: 0.9, sourceCount: 1, text: "O jogador estará lesionado, segundo a imprensa" });
  assert.equal(d.status, "DOUBTFUL");
  assert.ok(d.sensitive);
});

test("Fact QA: lesão confirmada oficialmente fica confirmada mas sensível", () => {
  const d = classifyFact({ id: "1", type: "INJURY", confidence: 0.7, sourceCount: 1, text: "O clube confirmou a lesão do defesa, que falha três semanas" });
  assert.equal(d.status, "CONFIRMED");
  assert.ok(d.sensitive, "lesão mantém cautela editorial mesmo confirmada");
});

test("Fact QA confirma mercado com corroboração de várias fontes", () => {
  const d = classifyFact({ id: "1", type: "TRANSFER", confidence: 0.7, sourceCount: 2, text: "vários interessados no jogador" });
  assert.equal(d.status, "CONFIRMED");
});

test("Fact QA confirma facto factual não sensível com confiança", () => {
  const d = classifyFact({ id: "1", type: "EVENT", confidence: 0.7, sourceCount: 1, text: "O Sporting venceu por 2-0" });
  assert.equal(d.status, "CONFIRMED");
  assert.ok(!d.sensitive);
});

test("classifyFacts resume corretamente as contagens", () => {
  const summary = classifyFacts([
    { id: "a", type: "EVENT", confidence: 0.7, text: "O jogo terminou empatado" },
    { id: "b", type: "TRANSFER", confidence: 0.9, text: "O clube prepara proposta, segundo a imprensa" },
    { id: "c", type: "GENERAL", confidence: 0.3, text: "contexto vago" },
  ]);
  assert.equal(summary.confirmed, 1); // só o EVENT
  assert.equal(summary.doubtful, 1); // o TRANSFER (rumor)
  assert.equal(summary.unconfirmed, 1); // o GENERAL de baixa confiança
  assert.equal(summary.sensitive, 1); // o TRANSFER
});

// ── Writer (só factos confirmados, sem invenção) ──

test("Writer usa apenas os factos confirmados que recebe", () => {
  const confirmed = [
    { id: "f1", text: "O Sporting empatou com o Braga em Alvalade", type: "EVENT" },
    { id: "f2", text: "Os leões marcaram primeiro no jogo", type: "EVENT" },
  ];
  const art = composeArticleHeuristic("Sporting empata com o Braga", confirmed);
  assert.deepEqual(art.usedFactIds.sort(), ["f1", "f2"]);
  assert.ok(art.body.includes("Sporting empatou com o Braga"));
  assert.ok(art.body.includes("marcaram primeiro"));
});

test("Writer não inventa: com zero factos confirmados o corpo não afirma factos", () => {
  const art = composeArticleHeuristic("Título qualquer", []);
  assert.equal(art.usedFactIds.length, 0);
  // Só título + enquadramento neutro, sem factos.
  assert.ok(art.body.includes("acompanha o desenvolvimento"));
});

test("Writer mais factos confirmados produz texto maior", () => {
  const few = composeArticleHeuristic("t", [{ id: "a", text: "Facto um do jogo", type: "EVENT" }]);
  const many = composeArticleHeuristic("t", [
    { id: "a", text: "Facto um do jogo de futebol em Lisboa", type: "EVENT" },
    { id: "b", text: "Facto dois sobre o resultado final da partida", type: "EVENT" },
    { id: "c", text: "Facto três sobre a próxima jornada da liga", type: "GENERAL" },
  ]);
  assert.ok(many.wordCount > few.wordCount);
  assert.equal(many.usedFactIds.length, 3);
});

test("Writer atribui rumor à fonte e diz que o clube não confirmou (regra 4)", () => {
  const art = composeArticleHeuristic(
    "Benfica prepara proposta pelo médio",
    [], // sem factos confirmados
    [{ id: "d1", text: "o Benfica prepara uma proposta pelo médio argentino", type: "TRANSFER" }],
    "Record"
  );
  assert.ok(art.body.includes("Segundo a Record"), "deve atribuir à fonte");
  assert.ok(art.body.includes("não confirmou"), "deve dizer que o clube não confirmou");
  assert.equal(art.usedFactIds[0], "d1");
});

test("Writer combina factos confirmados e rumores atribuídos", () => {
  const art = composeArticleHeuristic(
    "Título",
    [{ id: "c1", text: "Ramírez é internacional sub-23 pela Argentina", type: "GENERAL" }],
    [{ id: "d1", text: "o Benfica segue o jogador", type: "TRANSFER" }],
    "A Bola"
  );
  assert.ok(art.body.includes("Ramírez é internacional sub-23"));
  assert.ok(art.body.includes("Segundo a A Bola"));
  assert.deepEqual(art.usedFactIds.sort(), ["c1", "d1"]);
});

test("anti-cópia é mais tolerante para a fonte oficial (não morre em FALSE por texto curto)", () => {
  const { runEditorialQa } = require("../../lib/pipeline/editorial/qa-heuristic");
  // Corrida verbatim de 10 palavras de prosa comum partilhada com a fonte.
  const shared = "que vai representar uma mais valia enorme para o conjunto";
  const source = `O internacional foi contratado ${shared} nas próximas temporadas do clube.`;
  const body = `O reforço chega ao Benfica. Confirma-se ${shared}, segundo o clube. Uma boa notícia para os adeptos e para a equipa técnica.`;

  const naoOficial = runEditorialQa({ body, wordCount: 40, confirmedFactTexts: [], sourceTexts: [source], hasSensitiveFacts: false, official: false });
  const oficial = runEditorialQa({ body, wordCount: 40, confirmedFactTexts: [], sourceTexts: [source], hasSensitiveFacts: false, official: true });

  const temCopia = (r: { issues: { type: string }[] }) => r.issues.some((i) => i.type === "copia");
  assert.equal(temCopia(naoOficial), true, "fonte de terceiros: 10 palavras seguidas contam como cópia");
  assert.equal(temCopia(oficial), false, "fonte oficial: mesmo trecho não bloqueia (limiar 14)");
});
