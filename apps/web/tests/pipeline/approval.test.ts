import { test } from "node:test";
import assert from "node:assert/strict";
import { ApprovalDecision } from "@prisma/client";
import { decisionToState, isDecisionApplicable, requiredStateFor, DECISION_TO_STATE, DECISION_LABELS, TOPIC_DECISIONS } from "../../lib/pipeline/approval/decision";

const ALL_DECISIONS = Object.values(ApprovalDecision) as ApprovalDecision[];

test("todas as decisões têm estado e rótulo", () => {
  for (const d of ALL_DECISIONS) {
    assert.ok(DECISION_TO_STATE[d], `falta estado para ${d}`);
    assert.ok(DECISION_LABELS[d], `falta rótulo para ${d}`);
  }
});

test("cada decisão mapeia para uma transição válida a partir do seu gate", () => {
  for (const d of ALL_DECISIONS) {
    assert.ok(isDecisionApplicable(requiredStateFor(d), d), `${d} → ${decisionToState(d)} não é transição válida`);
  }
});

test("decisões de tema aplicam-se só no gate de pré-escrita", () => {
  assert.equal(requiredStateFor("WRITE_TOPIC"), "AWAITING_TOPIC_APPROVAL");
  assert.equal(decisionToState("WRITE_TOPIC"), "TOPIC_APPROVED");
  assert.equal(decisionToState("SKIP_TOPIC"), "ARCHIVED");
  // Não são aplicáveis no gate de publicação
  assert.ok(!isDecisionApplicable("AWAITING_APPROVAL", "WRITE_TOPIC"));
  assert.ok(TOPIC_DECISIONS.includes("WRITE_TOPIC"));
});

test("aprovar tudo → APPROVED_ALL", () => {
  assert.equal(decisionToState("APPROVE_ALL"), "APPROVED_ALL");
});

test("rejeitar texto → TEXT_REJECTED (reescreve)", () => {
  assert.equal(decisionToState("REJECT_TEXT_APPROVE_IMAGE"), "TEXT_REJECTED");
});

test("rejeitar tudo e cancelar → ARCHIVED", () => {
  assert.equal(decisionToState("REJECT_ALL"), "ARCHIVED");
  assert.equal(decisionToState("CANCEL"), "ARCHIVED");
});

test("guardar rascunho → SAVED_DRAFT", () => {
  assert.equal(decisionToState("SAVE_DRAFT"), "SAVED_DRAFT");
});

test("decisão não é aplicável fora de AWAITING_APPROVAL", () => {
  assert.ok(!isDecisionApplicable("WP_DRAFTED", "APPROVE_ALL"));
  assert.ok(!isDecisionApplicable("WRITTEN", "APPROVE_ALL"));
  assert.ok(!isDecisionApplicable("DONE", "APPROVE_ALL"));
});
