import assert from "node:assert/strict";
import { test } from "node:test";
import { runRecoveryQueue, runSequentialFallback } from "../scripts/recovery-queue.mjs";

test("stops retrying an item after the configured attempt limit", async () => {
  const result = await runRecoveryQueue(["completed", "failed"], {
    concurrency: 1,
    maxAttempts: 2,
    retryDelay: attempt => {
      if (attempt > 1) throw new Error("retry limit was not enforced");
      return 0;
    },
    worker: async item => {
      if (item === "failed") throw new Error("detail unavailable");
      return item;
    },
  });

  assert.deepEqual(result.completed.map(entry => entry.item), ["completed"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].item, "failed");
  assert.equal(result.failed[0].attempts, 2);
});

test("continues failed pages through the one-pass sequential fallback", async () => {
  const result = await runSequentialFallback([6, 7], {
    worker: async page => `page-${page}`,
  });

  assert.deepEqual(result.completed.map(entry => entry.item), [6, 7]);
  assert.deepEqual(result.completed.map(entry => entry.value), ["page-6", "page-7"]);
  assert.deepEqual(result.failed, []);
});
