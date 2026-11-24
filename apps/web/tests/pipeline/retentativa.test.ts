import { test } from "node:test";
import assert from "node:assert/strict";
import { isDecisionApplicable, requiredStatesFor, requiredStateFor } from "../../lib/pipeline/approval/decision";
import { canTransition } from "../../lib/pipeline/orchestrator/state-machine";

test("«Deixar cair» funciona nos DOIS cartões de pré-escrita", () => {
  assert.ok(isDecisionApplicable("AWAITING_TOPIC_APPROVAL", "SKIP_TOPIC"), "cartão do tema");
  assert.ok(isDecisionApplicable("AWAITING_TRANSCRIPT_APPROVAL", "SKIP_TOPIC"), "cartão da transcrição");
});

test("as outras decisões continuam presas ao seu gate", () => {
  assert.ok(!isDecisionApplicable("AWAITING_TRANSCRIPT_APPROVAL", "WRITE_TOPIC"));
  assert.ok(!isDecisionApplicable("AWAITING_TRANSCRIPT_APPROVAL", "APPROVE_ALL"));
  assert.ok(!isDecisionApplicable("AWAITING_TOPIC_APPROVAL", "APPROVE_ALL"));
});

test("cada estado de origem declarado permite mesmo a transição que a decisão pede", () => {
  for (const d of ["SKIP_TOPIC", "WRITE_TOPIC", "APPROVE_ALL", "REJECT_ALL", "CANCEL", "SAVE_DRAFT"] as const) {
    for (const s of requiredStatesFor(d)) {
      assert.ok(isDecisionApplicable(s, d), `${d} a partir de ${s}`);
    }
  }
});

test("requiredStateFor continua a dar o gate principal", () => {
  assert.equal(requiredStateFor("SKIP_TOPIC"), "AWAITING_TOPIC_APPROVAL");
  assert.equal(requiredStateFor("APPROVE_ALL"), "AWAITING_APPROVAL");
});

test("de FAILED quase nada é válido — é por isso que a re-tentativa tem de repor o estado", () => {
  assert.ok(!canTransition("FAILED", "TRANSCRIBED"));
  assert.ok(!canTransition("FAILED", "WRITTEN"));
  assert.ok(canTransition("FAILED", "ARCHIVED"), "arquivar continua a ser possível");
});
