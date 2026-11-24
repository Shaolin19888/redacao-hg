import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameTopic, decideDuplicate } from "../../lib/pipeline/dedup/decide";

/**
 * Regressão do caso real: três cartões sobre a terceira camisola do Benfica no mesmo dia.
 * O tema não tem nome próprio nenhum, por isso a regra da entidade partilhada ficava cega.
 */
const CAMISOLA = [
  "Benfica apresenta terceira camisola para 2026/27 (fotos)",
  "Terceira camisola do SL Benfica para 2026/27",
  "FOTOS: Benfica revela a terceira camisola (com tons de vermelho e azul)",
];

test("títulos quase iguais são o mesmo tema mesmo sem nome próprio", () => {
  assert.ok(isSameTopic(CAMISOLA[0], CAMISOLA[0], CAMISOLA[1], CAMISOLA[1]));
});

test("temas diferentes com estrutura parecida NÃO são juntados", () => {
  // Jogos diferentes e jogadoras diferentes: a 0,40 estes colavam, a 0,45 não.
  assert.ok(!isSameTopic(
    "Casa Pia perde com Feirense em jogo de preparação",
    "Casa Pia perde com Feirense em jogo de preparação",
    "Gil Vicente perde com Leixões em jogo de preparação",
    "Gil Vicente perde com Leixões em jogo de preparação",
  ));
  assert.ok(!isSameTopic(
    "Carolina Monteiro renova até 2027", "Carolina Monteiro renova até 2027",
    "Joana Semedo renova até 2027", "Joana Semedo renova até 2027",
  ));
});

test("a segunda notícia sobre a camisola é arquivada como duplicado da primeira", () => {
  const d = decideDuplicate(
    { id: "nova", simhash: null, title: CAMISOLA[1], text: CAMISOLA[1] },
    [{ id: "pendente", simhash: null, title: CAMISOLA[0], text: CAMISOLA[0] }],
  );
  assert.equal(d.isDuplicate, true);
  assert.equal(d.duplicateOfId, "pendente");
  assert.equal(d.reason, "mesmo-tema");
});
