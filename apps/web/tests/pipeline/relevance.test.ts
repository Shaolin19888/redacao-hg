import { test } from "node:test";
import assert from "node:assert/strict";
import { isBenficaCentral, applyRelevancePolicy } from "../../lib/pipeline/relevance/policy";

// ── Centralidade do Benfica ──

test("Benfica no título → central", () => {
  assert.ok(isBenficaCentral("Benfica vence o Sporting no clássico", "relato do jogo"));
});

test("menção de passagem (jogo do Famalicão) → NÃO central", () => {
  assert.ok(!isBenficaCentral(
    "Famalicão bate Lusitânia de Lourosa por 1-0",
    "O Famalicão venceu. O emprestado do Benfica, Gustavo Sá, não jogou."
  ));
});

// ── Política editorial ──

test("Benfica substancial → aceite e central (escreve auto)", () => {
  const p = applyRelevancePolicy("Benfica prepara reforço para o meio-campo", "O clube da Luz avança no mercado", null);
  assert.ok(p.relevant);
  assert.ok(p.benficaCentral);
  assert.equal(p.category, "Benfica");
});

test("jogo normal do FC Porto → RECUSADO", () => {
  const p = applyRelevancePolicy("FC Porto vence o Boavista por 2-0", "Golos na segunda parte no Dragão", null);
  assert.ok(!p.relevant);
});

test("polémica de arbitragem no Sporting → aceite (gate)", () => {
  const p = applyRelevancePolicy("Sporting revoltado com penálti não assinalado", "Treinador critica a arbitragem e o VAR", null);
  assert.ok(p.relevant);
  assert.ok(!p.benficaCentral);
  assert.equal(p.category, "Sporting");
});

test("contratação normal do Sporting → RECUSADO", () => {
  const p = applyRelevancePolicy("Sporting anuncia contratação de médio brasileiro", "Reforço assina por quatro épocas", null);
  assert.ok(!p.relevant);
});

test("nomeação no Conselho de Arbitragem → aceite (gate)", () => {
  const p = applyRelevancePolicy("Conselho de Arbitragem nomeia novo responsável", "Federação designou o dirigente", null);
  assert.ok(p.relevant);
  assert.equal(p.category, "Federação/Liga/Arbitragem");
});

test("medida da Liga Portugal → aceite (gate)", () => {
  const p = applyRelevancePolicy("Liga Portugal aprova nova medida sobre horários", "Comunicado da Liga de Clubes", null);
  assert.ok(p.relevant);
});

test("jogo normal da Liga (equipa qualquer) → RECUSADO", () => {
  const p = applyRelevancePolicy("Gil Vicente supera Vianense em jogo de preparação", "Teste competitivo antes da época", null);
  assert.ok(!p.relevant);
});

test("futebol internacional → RECUSADO", () => {
  const p = applyRelevancePolicy("Brentford vai usar a mesma camisola toda a época", "Decisão sustentável na Premier League", null);
  assert.ok(!p.relevant);
});

test("notícia não-futebol → RECUSADO", () => {
  const p = applyRelevancePolicy("Robô vestido de Haaland rouba atenções", "Curiosidade tecnológica", null);
  assert.ok(!p.relevant);
});
