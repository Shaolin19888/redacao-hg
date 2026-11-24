import { test } from "node:test";
import assert from "node:assert/strict";
import { linkableTerms, insertInternalLinks } from "../../lib/pipeline/seo/internal-links";

test("linkableTerms apanha clubes/jogadores e ignora inícios de frase", () => {
  const terms = linkableTerms(
    "Benfica arranca preparação com o Belenenses na Luz",
    "O treinador Marco Silva chamou o plantel. Segundo o clube, o Benfica joga com o Belenenses.",
  );
  assert.ok(terms.includes("Belenenses"));
  assert.ok(terms.some((t) => t.includes("Marco Silva")));
  assert.ok(!terms.includes("Segundo"));
  assert.ok(!terms.includes("Luz")); // stopword
});

test("insertInternalLinks liga a 1ª ocorrência, sem repetir URL nem sobrepor", () => {
  const body = "O Benfica venceu. O Benfica joga com o Belenenses e o Marco Silva sorri.";
  const { body: out, count } = insertInternalLinks(body, [
    { term: "Marco Silva", url: "https://s/marco" },
    { term: "Benfica", url: "https://s/benfica" },
    { term: "Belenenses", url: "https://s/belenenses" },
  ]);
  assert.equal(count, 3);
  // Só a primeira ocorrência de "Benfica" é ligada.
  assert.equal((out.match(/<a href="https:\/\/s\/benfica"/g) ?? []).length, 1);
  assert.ok(out.includes('<a href="https://s/marco">Marco Silva</a>'));
  assert.ok(out.includes('<a href="https://s/belenenses">Belenenses</a>'));
});

test("insertInternalLinks não duplica o mesmo URL", () => {
  const { count } = insertInternalLinks("Benfica e Encarnados.", [
    { term: "Benfica", url: "https://s/benfica" },
    { term: "Encarnados", url: "https://s/benfica" }, // mesmo URL → ignorado
  ]);
  assert.equal(count, 1);
});

test("verbos e apelos no início de frase não viram âncoras de link", () => {
  const { linkableTerms } = require("../../lib/pipeline/seo/internal-links");
  const corpo = `Reparem bem neste nome, Zach Solomon. Tem 22 anos e joga a distribuidor. Assinou contrato com o Benfica. Chegou de Espanha. Marco Silva elogiou o jovem.`;
  const t: string[] = linkableTerms("Zach Solomon reforça o Benfica", corpo);
  for (const mau of ["Reparem", "Assinou", "Chegou", "Tem"]) {
    assert.ok(!t.includes(mau), `"${mau}" não devia ser âncora de link`);
  }
  assert.ok(t.includes("Zach Solomon"), "entidades continuam a ser ligadas");
  assert.ok(t.includes("Benfica"));
  assert.ok(t.includes("Marco Silva"));
});
