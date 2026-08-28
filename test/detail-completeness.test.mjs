import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCompleteDetails } from "../scripts/boss-company-scout.mjs";

test("refuses to produce an analysis snapshot when a listed job has no JD", () => {
  const targets = [{ jobId: "ready" }, { jobId: "missing" }];
  const details = new Map([["ready", { description: "岗位职责" }]]);

  assert.throws(
    () => assertCompleteDetails(targets, details),
    /missing/,
  );
});
