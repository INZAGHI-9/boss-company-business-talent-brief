import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectorDirectory = path.join(skillDirectory, "scripts", "collector");

test("uses a self-contained current collector bundle for business and talent snapshots", async () => {
  const files = [
    "boss-company-scout.mjs", "analysis-input.mjs", "access-guard.mjs", "cdp-client.mjs",
    "checkpoint-writer.mjs", "company-navigation.mjs", "company-page-batch.mjs", "page-pacing.mjs",
    "page-readiness.mjs", "position-tab-coverage.mjs", "recovery-queue.mjs", "scout-run-lock.mjs",
  ];
  for (const file of files) assert.equal(existsSync(path.join(collectorDirectory, file)), true, `missing collector module ${file}`);
  const skill = readFileSync(path.join(skillDirectory, "SKILL.md"), "utf8");
  assert.match(skill, /scripts\/collector\/boss-company-scout\.mjs/);

  const { createAnalysisInput } = await import(pathToFileURL(path.join(collectorDirectory, "analysis-input.mjs")).href);
  const input = createAnalysisInput({
    candidate: { company: "示例公司", brandId: "brand-1", companyLink: "https://example.com/company" },
    coverage: { advertisedTotal: 1, complete: true },
    capturedAt: "2026-08-28T00:00:00.000Z",
    jobs: [{
      jobId: "job-1", title: "产品经理", jobLink: "https://example.com/job", city: "上海", location: "上海·徐汇",
      experience: "3-5年", salary: "20-30K", employmentMode: "全职", skills: ["SQL"], labels: ["产品"],
      description: "负责产品规划",
    }],
  });
  assert.deepEqual(input.jobs[0], {
    jobId: "job-1", title: "产品经理", url: "https://example.com/job", city: "上海", location: "上海·徐汇",
    experience: "3-5年", salary: "20-30K", employmentMode: "全职", skills: ["SQL"], requirementTags: ["产品"],
    description: "负责产品规划",
  });
});
