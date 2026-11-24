import { test } from "node:test";
import assert from "node:assert/strict";
import { VigiaRecolha, CICLOS_ATE_DESISTIR } from "../../lib/pipeline/health/watchdog";

test("falha total repetida faz o worker desistir, mas só ao fim do limite", () => {
  const v = new VigiaRecolha();
  for (let i = 1; i < CICLOS_ATE_DESISTIR; i++) {
    const r = v.registar({ tentadas: 4, falhadas: 4 });
    assert.equal(r.desistir, false, `ciclo ${i} não devia desistir`);
    assert.equal(r.seguidas, i);
  }
  const ultimo = v.registar({ tentadas: 4, falhadas: 4 });
  assert.equal(ultimo.desistir, true);
  assert.match(ultimo.motivo ?? "", /relançado/);
});

test("uma fonte em baixo não conta: só falha TOTAL é sintoma do processo", () => {
  const v = new VigiaRecolha();
  for (let i = 0; i < 10; i++) {
    assert.equal(v.registar({ tentadas: 4, falhadas: 3 }).desistir, false);
  }
});

test("qualquer sucesso limpa a contagem", () => {
  const v = new VigiaRecolha();
  v.registar({ tentadas: 4, falhadas: 4 });
  v.registar({ tentadas: 4, falhadas: 4 });
  assert.equal(v.registar({ tentadas: 4, falhadas: 0 }).seguidas, 0);
  // Depois de limpar, volta a precisar do limite inteiro.
  assert.equal(v.registar({ tentadas: 4, falhadas: 4 }).desistir, false);
});

test("ciclo sem fontes tentadas não conta nem a favor nem contra", () => {
  const v = new VigiaRecolha();
  v.registar({ tentadas: 4, falhadas: 4 });
  const r = v.registar({ tentadas: 0, falhadas: 0 }); // todas dentro da cadência
  assert.equal(r.seguidas, 1, "não devia somar nem apagar");
  assert.equal(r.desistir, false);
});

test("excepção a meio da recolha conta como ciclo falhado", () => {
  const v = new VigiaRecolha(2);
  assert.equal(v.registarExcepcao().desistir, false);
  assert.equal(v.registarExcepcao().desistir, true);
});
