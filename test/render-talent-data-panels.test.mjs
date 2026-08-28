import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFile = promisify(execFileCallback);
const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("renders deterministic HR tables, percentages, and two distribution charts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boss-talent-panels-"));
  const inputPath = path.join(directory, "talent-structure.json");
  const outputPath = path.join(directory, "talent-data-panels.md");
  const summaryPath = path.join(directory, "talent-attention-summary.md");
  await writeFile(inputPath, JSON.stringify({
    summary: { postingCount: 10, populationSegments: { nonIntern: { postingCount: 7 }, internship: { postingCount: 3 } } },
    workforceDimensions: {
      roleFamilies: [
        { value: "技术研发与质量", postingCount: 5, jobIds: ["job-1", "job-2", "job-3", "job-4", "job-5"] },
        { value: "产品、数据与项目", postingCount: 3, jobIds: ["job-6", "job-7", "job-8"] },
        { value: "创意、内容与生态", postingCount: 2, jobIds: ["job-9", "job-10"] },
      ],
      cities: [{ value: "厦门", postingCount: 6 }, { value: "深圳", postingCount: 4 }],
      experience: [{ value: "3-5年", postingCount: 4 }, { value: "1-3年", postingCount: 3 }],
      experienceUnclassified: [],
      internshipCommitment: [{ value: "5天/周 6个月", postingCount: 3 }],
      salaryCoverage: {
        comparableMonthlyKPostingCount: 7,
        nonComparablePostingCount: 3,
        totalPostingCount: 10,
        nonIntern: { comparableMonthlyKPostingCount: 7, nonComparablePostingCount: 0, totalPostingCount: 7 },
        internship: { comparableMonthlyKPostingCount: 0, nonComparablePostingCount: 3, totalPostingCount: 3 },
      },
      compensation: {
        nonInternMonthly: {
          postingCount: 7, totalNonInternPostingCount: 7, withSalaryMonthsCount: 6, withoutSalaryMonthsCount: 1,
          medianMidpointK: 20, middleFiftyRangeK: { low: 15, high: 25 },
          salaryMonthDistribution: [{ value: "15薪", postingCount: 6 }],
          annualizedFixedCash: { postingCount: 6, medianMidpointK: 300, middleFiftyRangeK: { low: 225, high: 375 } },
          midpointBands: [{ value: "15-<20K", postingCount: 3 }, { value: "20-<30K", postingCount: 4 }],
          byRoleFamily: [{ value: "技术研发与质量", postingCount: 4, medianMidpointK: 25, middleFiftyRangeK: { low: 20, high: 30 }, withSalaryMonthsCount: 4 }],
          byCity: [{ value: "厦门", postingCount: 4, medianMidpointK: 20, middleFiftyRangeK: { low: 15, high: 25 }, withSalaryMonthsCount: 3 }],
          byExperience: [{ value: "3-5年", postingCount: 4, medianMidpointK: 25, middleFiftyRangeK: { low: 20, high: 30 }, withSalaryMonthsCount: 4 }],
        },
        internshipDaily: {
          postingCount: 2, totalInternshipPostingCount: 3, medianMidpointRmb: 175,
          midpointBands: [{ value: "150-<200元/天", postingCount: 2 }],
        },
        hourlyPostingCount: 1,
      },
    },
    talentSignals: { skills: [
      { value: "周末双休", jobIds: ["job-1", "job-2", "job-3", "job-4"] },
      { value: "Python", jobIds: ["job-1", "job-2", "job-3"] },
      { value: "AIGC", jobIds: ["job-4"] },
    ] },
    postings: [
      { jobId: "job-1", title: "高级算法工程师", url: "https://example.com/1" },
      { jobId: "job-2", title: "机器学习工程师", url: "https://example.com/2" },
      { jobId: "job-3", title: "测试工程师", url: "https://example.com/3" },
      { jobId: "job-4", title: "后端工程师", url: "https://example.com/4" },
      { jobId: "job-5", title: "质量工程师", url: "https://example.com/5" },
      { jobId: "job-6", title: "产品经理", url: "https://example.com/6" },
      { jobId: "job-7", title: "数据分析师", url: "https://example.com/7" },
      { jobId: "job-8", title: "项目经理", url: "https://example.com/8" },
      { jobId: "job-9", title: "视觉设计师", url: "https://example.com/9" },
      { jobId: "job-10", title: "内容策划", url: "https://example.com/10" },
    ],
  }), "utf8");

  await execFile(process.execPath, ["scripts/render-talent-data-panels.mjs", "--input", inputPath, "--output", outputPath, "--summary-output", summaryPath], { cwd: skillDirectory });
  const panel = await readFile(outputPath, "utf8");
  const summary = await readFile(summaryPath, "utf8");

  assert.match(panel, /## 人才数据看板/);
  assert.match(panel, /\| 角色族 \| 岗位数 \| 占全部岗位 \|/);
  assert.match(panel, /\| 技术研发与质量 \| 5 \| 50\.0% \(5\/10\) \|/);
  assert.match(panel, /\| 厦门 \| 6 \| 60\.0% \(6\/10\) \|/);
  assert.match(panel, /\| 3-5年 \| 4 \| 57\.1% \(4\/7\) \|/);
  assert.match(panel, /\| Python \| 3 \| 30\.0% \(3\/10\) \|/);
  assert.doesNotMatch(panel, /\| 周末双休 \|/);
  assert.equal((panel.match(/```mermaid\n(?:.|\n)*?pie showData/g) || []).length, 3);
  assert.match(panel, /title 角色结构分布/);
  assert.match(panel, /title 地域分布/);
  assert.match(panel, /#### 图表洞察：角色结构/);
  assert.match(panel, /技术研发与质量为最大角色族，占全部岗位 50\.0% \(5\/10\)/);
  assert.match(panel, /可能的招聘侧意图：技术研发与质量明显高于其他角色，可能是在补充这一专业能力，但仍需结合岗位归属确认是否指向重点项目。/);
  assert.match(panel, /最该验证：技术研发与质量岗位是集中服务于同一批项目，还是分散的常规补缺。/);
  assert.match(panel, /#### 角色族岗位引用/);
  assert.match(panel, /技术研发与质量（5个岗位）：\[高级算法工程师\]\(https:\/\/example\.com\/1\)/);
  assert.match(panel, /\[质量工程师\]\(https:\/\/example\.com\/5\)/);
  assert.match(panel, /#### 图表洞察：地域分布/);
  assert.match(panel, /厦门为岗位最多城市，占全部岗位 60\.0% \(6\/10\)/);
  assert.match(panel, /### 薪酬结构（非实习）/);
  assert.match(panel, /区间中点 P50 为 20\.0K/);
  assert.match(panel, /15薪.*6.*85\.7% \(6\/7\)/);
  assert.match(panel, /年固定现金估算 P50.*300\.0K/);
  assert.match(panel, /title 非实习月薪区间中点分布/);
  assert.match(panel, /#### 图表洞察：薪酬结构/);
  assert.match(panel, /实习日薪/);
  assert.match(panel, /时薪岗位 1 个，未与月薪或日薪混合比较/);
  assert.match(summary, /## 值得关注/);
  assert.match(summary, /角色结构：技术研发与质量为最大角色族/);
  assert.match(summary, /经验与用工：非实习岗位中 3-5年为最大经验层级/);
  assert.match(summary, /可能的招聘侧意图：以中段经验人才作为可见的执行层补充/);
});
