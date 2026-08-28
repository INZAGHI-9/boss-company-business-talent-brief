import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps business and talent analysis independent from opportunity entry and modes", () => {
  const requiredFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/collection-contract.md",
    "references/agent-guide.md",
    "references/business-talent-prompts.md",
    "references/branch-ledger-contract.md",
    "references/reader-language-contract.md",
    "references/delivery-contract.md",
    "references/delivery-policy.md",
    "references/talent-report-contract.md",
    "scripts/boss-company-scout.mjs",
    "scripts/collector/boss-company-scout.mjs",
    "scripts/collector/analysis-input.mjs",
    "scripts/build-talent-structure.mjs",
    "scripts/render-talent-data-panels.mjs",
    "scripts/render-business-data-panels.mjs",
    "scripts/render-business-strategy-report.mjs",
    "scripts/business-analysis-contract.mjs",
    "scripts/cdp-client.mjs",
    "scripts/checkpoint-writer.mjs",
    "scripts/company-navigation.mjs",
    "scripts/company-page-batch.mjs",
    "scripts/page-readiness.mjs",
    "scripts/recovery-queue.mjs",
    "scripts/validate-delivery.mjs",
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(skillDirectory, relativePath)), true, `missing ${relativePath}`);
  }

  const instructions = requiredFiles
    .filter((relativePath) => relativePath.endsWith(".md"))
    .map((relativePath) => readFileSync(path.join(skillDirectory, relativePath), "utf8"))
    .join("\n");
  const collector = readFileSync(path.join(skillDirectory, "scripts", "collector", "boss-company-scout.mjs"), "utf8");

  assert.match(instructions, /业务战略报告/);
  assert.match(instructions, /人才数据分析报告/);
  assert.match(instructions, /全量 JD/);
  assert.match(instructions, /两个独立分支并行生成/);
  assert.match(instructions, /原生 CDP/);
  assert.match(instructions, /真实 Chrome/);
  assert.match(instructions, /不得回退到应用内浏览器/);
  assert.match(instructions, /不得要求用户自行运行采集、分析或报告步骤/);
  assert.match(instructions, /自动选择/);
  assert.match(instructions, /固定 3 个可复用工作页/);
  assert.match(instructions, /页面右侧已渲染 JD/);
  assert.match(instructions, /talent-structure\.json/);
  assert.match(instructions, /talent-evidence-ledger\.json/);
  assert.match(instructions, /business-evidence-ledger\.json/);
  assert.match(instructions, /business-data-panels\.md/);
  assert.match(instructions, /全量岗位链接.*职责原文/);
  assert.match(instructions, /叙事卡/);
  assert.match(instructions, /不得把字段名、分析步骤或方法说明作为正文标题或首句/);
  assert.match(instructions, /业务.*经营机制/);
  assert.match(instructions, /共同交付.*辅助/);
  assert.match(instructions, /人才数据分析报告/);
  assert.match(instructions, /角色结构、地域分布、经验层级、薪酬与用工、能力配置/);
  assert.match(instructions, /talent-data-panels\.md/);
  assert.match(instructions, /talent-attention-summary\.md/);
  assert.match(instructions, /可能的招聘侧意图/);
  assert.match(instructions, /非实习月薪.*实习日薪.*时薪/);
  assert.match(instructions, /区间中点.*薪数.*年固定现金估算/);
  assert.match(instructions, /角色族岗位引用/);
  assert.match(instructions, /全量岗位名称.*岗位链接/);
  assert.doesNotMatch(instructions, /共享事实包/);
  assert.doesNotMatch(instructions, /AIJOB[\\/]+work[\\/]+boss-company-talent-map/);
  assert.match(collector, /BOSS_BUSINESS_TALENT_BRIEF_HOME/);
  assert.doesNotMatch(collector, /boss-company-talent-map/);
  assert.doesNotMatch(instructions, /商机切入报告|客户业务底稿|our_company_context|快速版|深化版/);
});
