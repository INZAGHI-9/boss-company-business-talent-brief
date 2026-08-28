import assert from "node:assert/strict";
import { test } from "node:test";
import { selectCompany } from "../scripts/boss-company-scout.mjs";

test("automatically selects the strongest discovered company candidate and records the uncertainty", () => {
  const candidates = [
    { brandId: "brand-tech", company: "稿定科技", count: 14, cities: [] },
    { brandId: "brand-design", company: "稿定设计", count: 1, cities: [] },
  ];
  const jobs = [
    { jobId: "job-1", brandId: "brand-tech" },
    { jobId: "job-2", brandId: "brand-design" },
  ];

  const result = selectCompany(jobs, candidates, { company: "稿定" });

  assert.equal(result.candidate.brandId, "brand-tech");
  assert.deepEqual(result.jobs.map(job => job.jobId), ["job-1"]);
  assert.equal(result.entityResolution.mode, "automatic");
  assert.equal(result.entityResolution.confidence, "medium");
  assert.equal(result.entityResolution.candidateCount, 2);
});
