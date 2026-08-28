import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { classifyTalentRole } from "./build-talent-structure.mjs";
import { buildBusinessDataPanels } from "./render-business-data-panels.mjs";
import { buildTalentAttentionSummary, buildTalentDataPanels } from "./render-talent-data-panels.mjs";

function firstExcerpt(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const excerpt = text.split(/[。；;\n]/).find(line => /负责|主导|推动|制定|搭建|设计|分析|协同|管理|交付|优化|落地|规划|执行|研究|开发/.test(line))?.trim() || text.slice(0, 240);
  if (!excerpt) return "未观察到职责原文";
  return excerpt.length > 260 ? `${excerpt.slice(0, 257)}...` : excerpt;
}

function businessContext(job) {
  const title = String(job.title || "");
  if (/招聘|HR|人力|财务|出纳|法务|行政|客服/.test(title)) return ["未形成业务对象判断", "未观察到", "岗位原文不足以归入上述业务对象"];
  if (/海外|全球化|国际化|本地化|Localization|拉美|日本|韩国|泰国|葡萄牙语|EU|US/i.test(title)) return ["全球化产品与市场", "区域用户与本地渠道", "本地化、获客或跨区域交付"];
  if (/校园|创作者|供稿|内容生态|内容产品|KOL|网红|IP孵化|社媒|生态/.test(title)) return ["内容与生态", "创作者、校园或内容合作方", "内容供给、生态运营或合作"];
  if (/订阅|交易|支付|权益|商业化|广告|销售|投放|信息流|变现|付费/.test(title)) return ["交易与商业化", "付费、订阅或广告相关用户", "交易、权益或变现链路"];
  if (/图像|影像|视频|视觉|算法|计算机视觉|AIGC|AI产品|AI应用|AI算法|Agent/.test(title)) return ["影像与 AI 产品交付", "影像工具或创作场景用户", "产品、算法或工程化交付"];
  return ["未形成业务对象判断", "未观察到", "岗位原文不足以归入上述业务对象"];
}

function employmentPopulation(job) {
  return /实习|intern/i.test(`${job.title || ""} ${job.employmentMode || ""}`) ? "internship" : "nonIntern";
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean))];
}

function createLedgers(input) {
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const businessClaims = jobs.map((job, index) => {
    const [businessObject, marketOrUser, actionCategory] = businessContext(job);
    return {
      id: `business-${index + 1}`,
      jobId: job.jobId || `unidentified-${index + 1}`,
      jobUrl: job.url || null,
      title: job.title || "未观察到",
      businessObject,
      marketOrUser,
      actionCategory,
      sourceExcerpt: firstExcerpt(job.description),
      status: businessObject === "未形成业务对象判断" ? "未形成判断" : "直接事实",
      alternativeExplanation: "公开岗位用于招聘，不足以单独证明经营结果、投入规模或优先级。",
    };
  });
  const talentClaims = jobs.map((job, index) => ({
    id: `talent-${index + 1}`,
    jobId: job.jobId || `unidentified-${index + 1}`,
    jobUrl: job.url || null,
    title: job.title || "未观察到",
    roleFamily: classifyTalentRole(job.title),
    employmentPopulation: employmentPopulation(job),
    city: job.city || job.location || null,
    experience: job.experience || null,
    salary: job.salary || null,
    explicitSkills: unique([...unique(job.skills), ...unique(job.requirementTags)]),
    rawKeywords: unique([job.title, ...unique(job.skills), ...unique(job.requirementTags)]),
    abilityEvidence: firstExcerpt(job.description),
    status: String(job.description || "").trim() ? "直接事实" : "未形成判断",
    alternativeExplanation: "岗位要求不是团队既有能力、实际人数或招聘优先级的证明。",
  }));
  return {
    business: { schemaVersion: 1, branch: "business", coverage: { totalJobs: jobs.length, coveredJobIds: businessClaims.map(claim => claim.jobId) }, claims: businessClaims },
    talent: { schemaVersion: 1, branch: "talent", coverage: { totalJobs: jobs.length, coveredJobIds: talentClaims.map(claim => claim.jobId) }, claims: talentClaims },
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputPath = args[args.indexOf("--input") + 1];
  const talentPath = args[args.indexOf("--talent-structure") + 1];
  const outputDirectory = args[args.indexOf("--output-dir") + 1];
  if (!inputPath || !talentPath || !outputDirectory) throw new Error("用法: node build-branch-ledgers.mjs --input <analysis-input.json> --talent-structure <talent-structure.json> --output-dir <报告目录>");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const talentStructure = JSON.parse(await readFile(talentPath, "utf8"));
  const ledgers = createLedgers(input);
  await mkdir(outputDirectory, { recursive: true });
  await cp(inputPath, path.join(outputDirectory, "analysis-input.json"));
  await cp(talentPath, path.join(outputDirectory, "talent-structure.json"));
  await writeFile(path.join(outputDirectory, "talent-data-panels.md"), buildTalentDataPanels(talentStructure), "utf8");
  await writeFile(path.join(outputDirectory, "talent-attention-summary.md"), buildTalentAttentionSummary(talentStructure), "utf8");
  await writeFile(path.join(outputDirectory, "business-evidence-ledger.json"), `${JSON.stringify(ledgers.business, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, "business-data-panels.md"), buildBusinessDataPanels(ledgers.business), "utf8");
  await writeFile(path.join(outputDirectory, "talent-evidence-ledger.json"), `${JSON.stringify(ledgers.talent, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, "evidence-map.json"), `${JSON.stringify({ schemaVersion: 1, snapshot: input.snapshot || {}, coverage: { totalJobs: input.jobs?.length || 0, businessLedger: "business-evidence-ledger.json", businessPanels: "business-data-panels.md", talentLedger: "talent-evidence-ledger.json" } }, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, "report-index.json"), `${JSON.stringify({ schemaVersion: 1, generationIsolation: "isolated", reports: [{ branch: "business", ledger: "business-evidence-ledger.json", panels: "business-data-panels.md" }, { branch: "talent", ledger: "talent-evidence-ledger.json" }] }, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { createLedgers };
