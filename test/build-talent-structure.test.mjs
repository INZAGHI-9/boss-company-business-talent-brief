import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildTalentStructure } from "../scripts/build-talent-structure.mjs";
import { createLedgers } from "../scripts/build-branch-ledgers.mjs";
import { createAnalysisInput } from "../scripts/business-analysis-contract.mjs";
import { saveOutputs } from "../scripts/boss-company-scout.mjs";

const execFileAsync = promisify(execFile);

test("preserves raw salary when the collector writes the analysis input", () => {
  const input = createAnalysisInput({
    candidate: { company: "示例公司", brandId: "brand-1" },
    coverage: {},
    capturedAt: "2026-08-26T00:00:00.000Z",
    jobs: [{ jobId: "job-1", title: "客户成功", salary: "15-25K·14薪", description: "负责客户续约" }],
  });

  assert.equal(input.jobs[0].salary, "15-25K·14薪");
});

test("writes talent structure automatically with the collected snapshot", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "boss-talent-structure-"));
  try {
    await saveOutputs(outputDirectory, [{
      jobId: "job-1", brandId: "brand-1", company: "示例公司", title: "客户成功", salary: "15-25K·14薪",
      description: "负责客户续约", city: "厦门", experience: "3-5年", jobLink: "https://example.com/1",
    }], { company: "示例公司", brandId: "brand-1" }, { complete: true });

    const structure = JSON.parse(await readFile(path.join(outputDirectory, "talent-structure.json"), "utf8"));
    assert.equal(structure.summary.postingCount, 1);
    assert.equal(structure.postings[0].salary.raw, "15-25K·14薪");
    const panels = await readFile(path.join(outputDirectory, "talent-data-panels.md"), "utf8");
    assert.match(panels, /## 人才数据看板/);
    const attentionSummary = await readFile(path.join(outputDirectory, "talent-attention-summary.md"), "utf8");
    assert.match(attentionSummary, /## 值得关注/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("groups only exactly normalized JD text while preserving all postings", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-26T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "客户成功", url: "https://example.com/1", salary: "15-25K·14薪", description: "负责客户续约\n与增购" },
      { jobId: "job-2", title: "客户成功", url: "https://example.com/2", salary: "15-25K·14薪", description: "负责客户续约\r\n与增购" },
      { jobId: "job-3", title: "内容运营", url: "https://example.com/3", salary: "面议", description: "负责素材供给" },
    ],
  });

  assert.equal(result.summary.postingCount, 3);
  assert.equal(result.summary.uniqueJobIdCount, 3);
  assert.equal(result.summary.jdTemplateCount, 2);
  assert.equal(result.templates[0].postingCount, 2);
  assert.deepEqual(result.templates[0].postingJobIds, ["job-1", "job-2"]);
  assert.deepEqual(result.summary.salaryCoverage, { observedPostingCount: 2, totalPostingCount: 3 });
  assert.deepEqual(result.postings[0].salary, {
    raw: "15-25K·14薪", minMonthlyK: 15, maxMonthlyK: 25, salaryMonths: 14,
    minDailyRmb: null, maxDailyRmb: null, minHourlyRmb: null, maxHourlyRmb: null,
  });
  assert.deepEqual(result.postings[2].salary, {
    raw: "面议", minMonthlyK: null, maxMonthlyK: null, salaryMonths: null,
    minDailyRmb: null, maxDailyRmb: null, minHourlyRmb: null, maxHourlyRmb: null,
  });
  assert.equal(result.unformedPostings.length, 0);
});

test("marks a posting without a JD as unformed instead of discarding it", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-26T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "待补JD", url: "https://example.com/1", description: "" },
    ],
  });

  assert.equal(result.summary.postingCount, 1);
  assert.equal(result.summary.jdTemplateCount, 0);
  assert.deepEqual(result.unformedPostings, [{ jobId: "job-1", reason: "JD为空" }]);
});

test("surfaces leadership-title and highest-observed salary signals without treating them as hiring priority", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-26T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "客户成功", url: "https://example.com/1", salary: "15-25K·14薪", description: "负责客户续约" },
      { jobId: "job-2", title: "版权安全负责人", url: "https://example.com/2", salary: "50-80K·14薪", description: "建立版权审核体系" },
    ],
  });

  assert.deepEqual(result.attentionSignals.leadershipTitleJobIds, ["job-2"]);
  assert.equal(result.attentionSignals.salaryRanking[0].jobId, "job-2");
  assert.equal(result.attentionSignals.salaryRanking[0].rank, 1);
});

test("keeps internship postings out of non-intern salary and role analysis", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-26T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "客户成功", url: "https://example.com/1", salary: "15-25K·14薪", description: "负责客户续约" },
      { jobId: "job-2", title: "视频剪辑实习生", url: "https://example.com/2", salary: "3-4K", description: "负责短视频剪辑" },
    ],
  });

  assert.deepEqual(result.summary.populationSegments, {
    nonIntern: { postingCount: 1, jdTemplateCount: 1 },
    internship: { postingCount: 1, jdTemplateCount: 1 },
    unknown: { postingCount: 0, jdTemplateCount: 0 },
  });
  assert.deepEqual(result.attentionSignals.salaryRanking.map(signal => signal.jobId), ["job-1"]);
  assert.deepEqual(result.internshipPostings.map(posting => posting.jobId), ["job-2"]);
});

test("indexes explicit skills, responsibility evidence, and raw keywords for talent analysis", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-26T00:00:00.000Z" },
    jobs: [{
      jobId: "job-1",
      title: "海外增长运营",
      url: "https://example.com/1",
      skills: ["SQL", "Python"],
      requirementTags: ["数据分析", "英语"],
      description: "负责制定海外增长策略，推动产品与市场团队完成本地化落地。",
    }],
  });

  assert.deepEqual(result.talentSignals.skills.map(signal => signal.value), ["Python", "SQL", "数据分析", "英语"]);
  assert.equal(result.talentSignals.abilityEvidence[0].jobId, "job-1");
  assert.match(result.talentSignals.abilityEvidence[0].sourceExcerpt, /负责制定海外增长策略/);
  assert.deepEqual(result.talentSignals.keywords.map(signal => signal.value), ["Python", "SQL", "数据分析", "海外增长运营", "英语"]);
});

test("builds HR workforce dimensions across role, city, experience, employment, and salary coverage", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-27T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "高级算法工程师", city: "北京", experience: "3-5年", salary: "25-40K·15薪", description: "负责模型部署。" },
      { jobId: "job-2", title: "产品经理", city: "深圳", experience: "1-3年", salary: "15-25K", description: "负责产品规划。" },
      { jobId: "job-3", title: "AI视频岗位", city: "北京", experience: "5天/周 6个月", salary: "200元/天", description: "负责视频效果测试。" },
    ],
  });

  assert.deepEqual(result.workforceDimensions.roleFamilies, [
    { value: "技术研发与质量", postingCount: 2, jobIds: ["job-1", "job-3"] },
    { value: "产品、数据与项目", postingCount: 1, jobIds: ["job-2"] },
  ]);
  assert.deepEqual(result.workforceDimensions.cities, [
    { value: "北京", postingCount: 2, jobIds: ["job-1", "job-3"] },
    { value: "深圳", postingCount: 1, jobIds: ["job-2"] },
  ]);
  assert.deepEqual(result.workforceDimensions.experience, [
    { value: "1-3年", postingCount: 1, jobIds: ["job-2"] },
    { value: "3-5年", postingCount: 1, jobIds: ["job-1"] },
  ]);
  assert.deepEqual(result.workforceDimensions.internshipCommitment, [
    { value: "5天/周 6个月", postingCount: 1, jobIds: ["job-3"] },
  ]);
  assert.deepEqual(result.workforceDimensions.experienceUnclassified, []);
  assert.deepEqual(result.workforceDimensions.employment, [
    { value: "internship", postingCount: 1, jobIds: ["job-3"] },
    { value: "nonIntern", postingCount: 2, jobIds: ["job-1", "job-2"] },
  ]);
  assert.deepEqual(result.workforceDimensions.salaryCoverage, {
    comparableMonthlyKPostingCount: 2,
    nonComparablePostingCount: 1,
    totalPostingCount: 3,
    nonIntern: { comparableMonthlyKPostingCount: 2, nonComparablePostingCount: 0, totalPostingCount: 2 },
    internship: { comparableMonthlyKPostingCount: 0, nonComparablePostingCount: 1, totalPostingCount: 1 },
  });
});

test("builds comparable compensation profiles without mixing monthly, daily, and hourly pay", () => {
  const result = buildTalentStructure({
    snapshot: { company: "示例公司", brandId: "brand-1", capturedAt: "2026-08-27T00:00:00.000Z" },
    jobs: [
      { jobId: "job-1", title: "高级算法工程师", city: "北京", experience: "3-5年", salary: "25-40K·15薪", description: "负责模型部署。" },
      { jobId: "job-2", title: "产品经理", city: "厦门", experience: "1-3年", salary: "15-25K·14薪", description: "负责产品规划。" },
      { jobId: "job-3", title: "招聘经理", city: "厦门", experience: "1-3年", salary: "6000-10000元/月", description: "负责招聘交付。" },
      { jobId: "job-4", title: "AI视频实习生", city: "北京", experience: "5天/周 6个月", salary: "150-200元/天", description: "负责视频效果测试。" },
      { jobId: "job-5", title: "设计实习生", city: "北京", experience: "5天/周 3个月", salary: "5-200元/时", description: "负责设计支持。" },
      { jobId: "job-6", title: "运营经理", city: "深圳", experience: "3-5年", salary: "面议", description: "负责运营优化。" },
    ],
  });

  assert.deepEqual(result.postings[2].salary, {
    raw: "6000-10000元/月", minMonthlyK: 6, maxMonthlyK: 10, salaryMonths: null,
    minDailyRmb: null, maxDailyRmb: null, minHourlyRmb: null, maxHourlyRmb: null,
  });
  assert.deepEqual(result.postings[3].salary, {
    raw: "150-200元/天", minMonthlyK: null, maxMonthlyK: null, salaryMonths: null,
    minDailyRmb: 150, maxDailyRmb: 200, minHourlyRmb: null, maxHourlyRmb: null,
  });
  assert.equal(result.workforceDimensions.compensation.nonInternMonthly.postingCount, 3);
  assert.equal(result.workforceDimensions.compensation.nonInternMonthly.withSalaryMonthsCount, 2);
  assert.deepEqual(result.workforceDimensions.compensation.nonInternMonthly.salaryMonthDistribution, [
    { value: "14薪", postingCount: 1, jobIds: ["job-2"] },
    { value: "15薪", postingCount: 1, jobIds: ["job-1"] },
  ]);
  assert.deepEqual(result.workforceDimensions.compensation.nonInternMonthly.annualizedFixedCash, {
    postingCount: 2,
    medianMidpointK: 383.75,
    middleFiftyRangeK: { low: 331.875, high: 435.625 },
  });
  assert.deepEqual(result.workforceDimensions.compensation.nonInternMonthly.midpointBands, [
    { value: "10K以下", postingCount: 1, jobIds: ["job-3"] },
    { value: "20-<30K", postingCount: 1, jobIds: ["job-2"] },
    { value: "30K及以上", postingCount: 1, jobIds: ["job-1"] },
  ]);
  assert.deepEqual(result.workforceDimensions.compensation.internshipDaily, {
    postingCount: 1,
    totalInternshipPostingCount: 2,
    medianMidpointRmb: 175,
    midpointBands: [{ value: "150-<200元/天", postingCount: 1, jobIds: ["job-4"] }],
  });
  assert.deepEqual(result.workforceDimensions.compensation.nonInternMonthly.byRoleFamily.map(item => [item.value, item.postingCount, item.medianMidpointK]), [
    ["产品、数据与项目", 1, 20],
    ["技术研发与质量", 1, 32.5],
    ["职能与专业支持", 1, 8],
  ]);
});

test("writes talent signals when invoked through the command-line entry point", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "boss-talent-cli-"));
  const inputPath = path.join(directory, "analysis-input.json");
  const outputPath = path.join(directory, "talent-structure.json");
  try {
    await writeFile(inputPath, JSON.stringify({
      snapshot: { company: "示例公司" },
      jobs: [{ jobId: "job-1", title: "算法工程师", skills: ["Python"], description: "负责模型部署。" }],
    }), "utf8");
    await execFileAsync(process.execPath, ["scripts/build-talent-structure.mjs", "--input", inputPath, "--output", outputPath], {
      cwd: path.resolve(import.meta.dirname, ".."),
    });
    const result = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(result.talentSignals.skills.map(signal => signal.value), ["Python"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builds separate full-coverage evidence ledgers without a shared claim set", () => {
  const ledgers = createLedgers({ jobs: [
    { jobId: "job-1", title: "订阅产品经理", url: "https://example.com/1", skills: ["商业产品"], description: "负责订阅交易策略落地。" },
    { jobId: "job-2", title: "视觉算法工程师", url: "https://example.com/2", requirementTags: ["Python"], description: "负责图像模型部署。" },
  ] });
  assert.equal(ledgers.business.branch, "business");
  assert.equal(ledgers.talent.branch, "talent");
  assert.deepEqual(ledgers.business.coverage.coveredJobIds, ["job-1", "job-2"]);
  assert.deepEqual(ledgers.talent.coverage.coveredJobIds, ["job-1", "job-2"]);
  assert.equal(ledgers.talent.claims[0].explicitSkills[0], "商业产品");
  assert.equal(ledgers.business.claims[0].businessObject, "交易与商业化");
  assert.equal(ledgers.talent.claims[0].roleFamily, "产品、数据与项目");
  assert.equal(ledgers.talent.claims[1].roleFamily, "技术研发与质量");
});

test("derives business themes from a new company's job evidence instead of company-specific samples", () => {
  const ledgers = createLedgers({ jobs: [
    { jobId: "other-1", title: "会员支付产品负责人", description: "负责会员支付、订单履约和权益配置" },
    { jobId: "other-2", title: "海外本地化运营（西班牙）", description: "负责西班牙市场的本地化运营" },
    { jobId: "other-3", title: "内容创作者运营", description: "负责创作者招募和内容供给" },
    { jobId: "other-4", title: "招聘负责人（全球）", description: "负责全球招聘交付" },
    { jobId: "other-5", title: "海外广告运营", description: "负责区域广告投放" },
  ] });
  const themes = ledgers.business.claims.map(claim => [claim.jobId, claim.businessObject]);
  assert.deepEqual(themes, [
    ["other-1", "交易与商业化"],
    ["other-2", "全球化产品与市场"],
    ["other-3", "内容与生态"],
    ["other-4", "未形成业务对象判断"],
    ["other-5", "全球化产品与市场"],
  ]);
});
