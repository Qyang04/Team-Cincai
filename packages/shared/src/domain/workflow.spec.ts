import test from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./workflow.ts";

test("RECOVERABLE_EXCEPTION can re-enter policy review", () => {
  assert.equal(canTransition("RECOVERABLE_EXCEPTION", "POLICY_REVIEW"), true);
});

test("REJECTED cannot move to export", () => {
  assert.equal(canTransition("REJECTED", "EXPORT_READY"), false);
});

test("AWAITING_APPROVER_INFO_RESPONSE can return to approval", () => {
  assert.equal(canTransition("AWAITING_APPROVER_INFO_RESPONSE", "AWAITING_APPROVAL"), true);
});
