import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildBusinessDataPanels } from "./render-business-data-panels.mjs";
import { buildTalentAttentionSummary, buildTalentDataPanels } from "./render-talent-data-panels.mjs";

const argumentsList = process.argv.slice(2);
const directoryIndex = argumentsList.indexOf("--dir");
const directory = directoryIndex >= 0 ? argumentsList[directoryIndex + 1] : undefined;
const requiredFiles = [
  "analysis-input.json",
  "business-evidence-ledger.json",
  "talent-evidence-ledger.json",
  "business-strategy-report.md",
  "talent-strategy-report.md",
  "evidence-map.json",
  "report-index.json",
  "manifest.json",
];
const processLanguageHeadings = [
  /^数据校准$/,
  /^业务判断(?:[｜:：].*)?$/,
  /^可观察动作(?:[｜:：].*)?$/,
  /^经营变量(?:[｜:：].*)?$/,
  /^人才组合(?:[｜:：].*)?$/,
  /^显性技能$/,
  /^能力证据$/,
  /^原始关键词$/,
  /^样本内信号$/,
  /^管理\/?负责人标题信号$/,
  /^证据边界(?:与待确认)?$/,
];
const sharedReaderHeadings = new Set(["思维导图", "依据与限制"]);
const requiredTalentDimensionHeadings = [
  ["人才结构", /人才结构/],
  ["地域与布局", /地域|城市/],
  ["经验与梯队", /经验|资历|梯队/],
  ["薪酬与用工", /薪酬|薪资|用工/],
  ["能力配置", /能力配置|人才规格|技能要求/],
];

function readerHeadings(content) {
  return content
    .split(/\r?\n/)
    .map(line => line.match(/^#{2,3}\s+(.+?)\s*$/)?.[1]?.trim())
    .filter(Boolean);
}

if (!directory) {
  console.error("usage: node scripts/validate-delivery.mjs --dir <report-directory>");
  process.exit(1);
}

const missingFiles = requiredFiles.filter((file) => !existsSync(path.join(directory, file)));
if (missingFiles.length > 0) {
  console.error(`missing required files: ${missingFiles.join(", ")}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
} catch {
  console.error("manifest.json must be valid JSON");
  process.exit(1);
}

if (Number.isNaN(Date.parse(manifest.generatedAt))) {
  console.error("manifest.generatedAt must be a valid ISO timestamp");
  process.exit(1);
}

if (!Array.isArray(manifest.files) || requiredFiles.some((file) => !manifest.files.includes(file))) {
  console.error("manifest.files must include every required relative file");
  process.exit(1);
}

const branches = manifest.generation?.branches;
const validBranches = Array.isArray(branches)
  && branches.length === 2
  && branches.some((branch) => branch.report === "business-strategy-report.md" && branch.branch === "business" && branch.generationIsolation === "isolated")
  && branches.some((branch) => branch.report === "talent-strategy-report.md" && branch.branch === "talent" && branch.generationIsolation === "isolated");

if (!validBranches) {
  console.error("manifest.generation.branches must declare isolated business and talent reports");
  process.exit(1);
}

let businessLedger;
for (const [file, branch] of [["business-evidence-ledger.json", "business"], ["talent-evidence-ledger.json", "talent"]]) {
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  } catch {
    console.error(`${file} must be valid JSON`);
    process.exit(1);
  }
  if (ledger?.branch !== branch || !Array.isArray(ledger?.claims)) {
    console.error(`${file} must declare branch ${branch} and a claims array`);
    process.exit(1);
  }
  if (branch === "business") businessLedger = ledger;
}

const headingsByReport = new Map();
for (const file of ["business-strategy-report.md", "talent-strategy-report.md"]) {
  const content = readFileSync(path.join(directory, file), "utf8");
  if (!/```mermaid\s*\r?\n\s*mindmap/.test(content)) {
    console.error(`${file} must start with a Mermaid mindmap section`);
    process.exit(1);
  }
  const headings = readerHeadings(content);
  const processHeading = headings.find(heading => processLanguageHeadings.some(pattern => pattern.test(heading)));
  if (processHeading) {
    console.error(`${file} has process-language heading: ${processHeading}`);
    process.exit(1);
  }
  headingsByReport.set(file, headings);
}

const businessHeadings = headingsByReport.get("business-strategy-report.md") || [];
const talentHeadings = new Set(headingsByReport.get("talent-strategy-report.md") || []);
const overlappingHeading = businessHeadings.find(heading => !sharedReaderHeadings.has(heading) && talentHeadings.has(heading));
if (overlappingHeading) {
  console.error(`reader headings overlap across isolated branches: ${overlappingHeading}`);
  process.exit(1);
}

const missingTalentDimensions = requiredTalentDimensionHeadings
  .filter(([, pattern]) => ![...talentHeadings].some(heading => pattern.test(heading)))
  .map(([name]) => name);
if (missingTalentDimensions.length > 0) {
  console.error(`talent-strategy-report.md missing HR data dimensions: ${missingTalentDimensions.join(", ")}`);
  process.exit(1);
}

const businessDirectFacts = (businessLedger?.claims || []).filter(claim => claim?.status === "直接事实" && claim.businessObject !== "未形成业务对象判断");
if (businessDirectFacts.length > 0) {
  const businessVisualFiles = ["business-data-panels.md"];
  const missingBusinessVisualFiles = businessVisualFiles.filter(file => !existsSync(path.join(directory, file)) || !manifest.files.includes(file));
  if (missingBusinessVisualFiles.length > 0) {
    console.error(`delivery must include business data panels: ${missingBusinessVisualFiles.join(", ")}`);
    process.exit(1);
  }
  const expectedBusinessPanels = buildBusinessDataPanels(businessLedger);
  const savedBusinessPanels = readFileSync(path.join(directory, "business-data-panels.md"), "utf8");
  if (savedBusinessPanels !== expectedBusinessPanels) {
    console.error("business-data-panels.md must match the deterministic business data panel");
    process.exit(1);
  }
  const businessReport = readFileSync(path.join(directory, "business-strategy-report.md"), "utf8");
  if (!businessReport.includes(expectedBusinessPanels)) {
    console.error("business-strategy-report.md must embed deterministic business data panels");
    process.exit(1);
  }
}

let talentStructure;
const visualFiles = ["talent-structure.json", "talent-data-panels.md", "talent-attention-summary.md"];
const missingVisualFiles = visualFiles.filter(file => !existsSync(path.join(directory, file)) || !manifest.files.includes(file));
if (missingVisualFiles.length > 0) {
  console.error(`delivery must include talent data panels: ${missingVisualFiles.join(", ")}`);
  process.exit(1);
}
try {
  talentStructure = JSON.parse(readFileSync(path.join(directory, "talent-structure.json"), "utf8"));
} catch {
  console.error("talent-structure.json must be valid JSON");
  process.exit(1);
}
const expectedPanels = buildTalentDataPanels(talentStructure);
const expectedAttentionSummary = buildTalentAttentionSummary(talentStructure);
const savedPanels = readFileSync(path.join(directory, "talent-data-panels.md"), "utf8");
if (savedPanels !== expectedPanels) {
  console.error("talent-data-panels.md must match the deterministic talent data panel");
  process.exit(1);
}
const talentReport = readFileSync(path.join(directory, "talent-strategy-report.md"), "utf8");
if (!talentReport.includes(expectedPanels)) {
  console.error("talent-strategy-report.md must embed deterministic talent data panels");
  process.exit(1);
}
const savedAttentionSummary = readFileSync(path.join(directory, "talent-attention-summary.md"), "utf8");
if (savedAttentionSummary !== expectedAttentionSummary) {
  console.error("talent-attention-summary.md must match the deterministic talent attention summary");
  process.exit(1);
}
if (!talentReport.trimEnd().endsWith(expectedAttentionSummary.trimEnd())) {
  console.error("talent-strategy-report.md must end with deterministic talent attention summary");
  process.exit(1);
}

console.log("business-talent delivery contract passed");
