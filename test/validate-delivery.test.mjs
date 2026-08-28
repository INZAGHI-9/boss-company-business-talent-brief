import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildTalentAttentionSummary, buildTalentDataPanels } from "../scripts/render-talent-data-panels.mjs";

const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(skillDirectory, "scripts", "validate-delivery.mjs");

function visualFixture() {
  return {
    summary: { postingCount: 2, populationSegments: { nonIntern: { postingCount: 2 }, internship: { postingCount: 0 } } },
    workforceDimensions: {
      roleFamilies: [{ value: "技术研发与质量", postingCount: 1 }, { value: "产品、数据与项目", postingCount: 1 }],
      cities: [{ value: "厦门", postingCount: 2 }],
      experience: [{ value: "3-5年", postingCount: 2 }],
      experienceUnclassified: [],
      internshipCommitment: [],
      salaryCoverage: {
        comparableMonthlyKPostingCount: 2, nonComparablePostingCount: 0, totalPostingCount: 2,
        nonIntern: { comparableMonthlyKPostingCount: 2, nonComparablePostingCount: 0, totalPostingCount: 2 },
        internship: { comparableMonthlyKPostingCount: 0, nonComparablePostingCount: 0, totalPostingCount: 0 },
      },
    },
    talentSignals: { skills: [{ value: "Python", jobIds: ["job-1"] }] },
  };
}

test("rejects a talent report that does not embed the deterministic data panel", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-missing-panel-"));
  const structure = visualFixture();
  const attentionSummary = buildTalentAttentionSummary(structure);
  const files = [
    "analysis-input.json", "talent-structure.json", "talent-data-panels.md", "talent-attention-summary.md", "business-evidence-ledger.json", "talent-evidence-ledger.json",
    "business-strategy-report.md", "talent-strategy-report.md", "evidence-map.json", "report-index.json", "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "talent-structure.json"), JSON.stringify(structure), "utf8");
  writeFileSync(path.join(directory, "talent-data-panels.md"), buildTalentDataPanels(structure), "utf8");
  writeFileSync(path.join(directory, "talent-attention-summary.md"), attentionSummary, "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```\n## 经营机制", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```\n## 人才结构\n## 地域与布局\n## 经验与梯队\n## 薪酬与用工\n## 能力配置", "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-27T00:00:00.000Z", files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "report without its data panel must be rejected");
  assert.match(result.stderr, /must embed deterministic talent data panels/);
});

test("rejects a talent report that does not end with the deterministic attention summary", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-missing-summary-"));
  const structure = visualFixture();
  const panels = buildTalentDataPanels(structure);
  const summary = buildTalentAttentionSummary(structure);
  const files = [
    "analysis-input.json", "talent-structure.json", "talent-data-panels.md", "talent-attention-summary.md", "business-evidence-ledger.json", "talent-evidence-ledger.json",
    "business-strategy-report.md", "talent-strategy-report.md", "evidence-map.json", "report-index.json", "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "talent-structure.json"), JSON.stringify(structure), "utf8");
  writeFileSync(path.join(directory, "talent-data-panels.md"), panels, "utf8");
  writeFileSync(path.join(directory, "talent-attention-summary.md"), summary, "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```\n## 经营机制", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), `\`\`\`mermaid\nmindmap\n\`\`\`\n${panels}\n## 人才结构\n## 地域与布局\n## 经验与梯队\n## 薪酬与用工\n## 能力配置`, "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-27T00:00:00.000Z", files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "report without a final attention summary must be rejected");
  assert.match(result.stderr, /must end with deterministic talent attention summary/);
});

test("accepts a self-contained business and talent delivery without a mode flag", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-"));
  const structure = visualFixture();
  const panels = buildTalentDataPanels(structure);
  const attentionSummary = buildTalentAttentionSummary(structure);
  const files = [
    "analysis-input.json",
    "talent-structure.json",
    "talent-data-panels.md",
    "talent-attention-summary.md",
    "business-evidence-ledger.json",
    "talent-evidence-ledger.json",
    "business-strategy-report.md",
    "talent-strategy-report.md",
    "evidence-map.json",
    "report-index.json",
    "manifest.json",
  ];

  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "talent-structure.json"), JSON.stringify(structure), "utf8");
  writeFileSync(path.join(directory, "talent-data-panels.md"), panels, "utf8");
  writeFileSync(path.join(directory, "talent-attention-summary.md"), attentionSummary, "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), `\`\`\`mermaid\nmindmap\n\`\`\`\n${panels}\n## 人才结构\n## 地域与布局\n## 经验与梯队\n## 薪酬与用工\n## 能力配置\n${attentionSummary}`, "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-26T00:00:00.000Z",
    files,
    generation: {
      branches: [
        { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
        { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
      ],
    },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /business-talent delivery contract passed/);
});

test("rejects a delivery without separate branch evidence ledgers", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-missing-ledger-"));
  const files = [
    "analysis-input.json",
    "business-strategy-report.md",
    "talent-strategy-report.md",
    "evidence-map.json",
    "report-index.json",
    "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```", "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-26T00:00:00.000Z",
    files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "delivery without separate ledgers must be rejected");
  assert.match(result.stderr, /business-evidence-ledger\.json/);
});

test("rejects a branch ledger assigned to the wrong reader view", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-wrong-ledger-"));
  const files = [
    "analysis-input.json",
    "business-evidence-ledger.json",
    "talent-evidence-ledger.json",
    "business-strategy-report.md",
    "talent-strategy-report.md",
    "evidence-map.json",
    "report-index.json",
    "manifest.json",
  ];
  for (const file of files) writeFileSync(path.join(directory, file), "{}", "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```", "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-26T00:00:00.000Z",
    files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "misassigned branch ledger must be rejected");
  assert.match(result.stderr, /business-evidence-ledger\.json.*business/);
});

test("rejects process-language headings in reader reports", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-process-heading-"));
  const files = [
    "analysis-input.json", "business-evidence-ledger.json", "talent-evidence-ledger.json",
    "business-strategy-report.md", "talent-strategy-report.md", "evidence-map.json", "report-index.json", "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```\n## 数据校准", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```\n## 人才规格", "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-27T00:00:00.000Z", files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "reader report must not lead with process language");
  assert.match(result.stderr, /process-language heading/);
});

test("rejects duplicate reader headings across isolated branches", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-overlapping-heading-"));
  const files = [
    "analysis-input.json", "business-evidence-ledger.json", "talent-evidence-ledger.json",
    "business-strategy-report.md", "talent-strategy-report.md", "evidence-map.json", "report-index.json", "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```\n## 全球化增长", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```\n## 全球化增长", "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-27T00:00:00.000Z", files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "isolated branches must not reuse reader headings");
  assert.match(result.stderr, /reader headings overlap/);
});

test("rejects a talent report without HR data dimensions", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "boss-business-talent-missing-hr-dimensions-"));
  const files = [
    "analysis-input.json", "business-evidence-ledger.json", "talent-evidence-ledger.json",
    "business-strategy-report.md", "talent-strategy-report.md", "evidence-map.json", "report-index.json", "manifest.json",
  ];
  writeFileSync(path.join(directory, "analysis-input.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "business-evidence-ledger.json"), JSON.stringify({ branch: "business", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "talent-evidence-ledger.json"), JSON.stringify({ branch: "talent", claims: [] }), "utf8");
  writeFileSync(path.join(directory, "business-strategy-report.md"), "```mermaid\nmindmap\n```\n## 经营机制", "utf8");
  writeFileSync(path.join(directory, "talent-strategy-report.md"), "```mermaid\nmindmap\n```\n## 人才结构\n## 依据与限制", "utf8");
  writeFileSync(path.join(directory, "evidence-map.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "report-index.json"), "{}", "utf8");
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    generatedAt: "2026-08-27T00:00:00.000Z", files,
    generation: { branches: [
      { report: "business-strategy-report.md", branch: "business", generationIsolation: "isolated" },
      { report: "talent-strategy-report.md", branch: "talent", generationIsolation: "isolated" },
    ] },
  }), "utf8");

  const result = spawnSync(process.execPath, [validator, "--dir", directory], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "talent report must cover all required HR data dimensions");
  assert.match(result.stderr, /missing HR data dimensions/);
});
