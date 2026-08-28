import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildTalentAttentionSummary, buildTalentDataPanels } from "./render-talent-data-panels.mjs";

function largest(values) {
  return [...(Array.isArray(values) ? values : [])].sort((left, right) => right.postingCount - left.postingCount)[0];
}

function renderTalentStrategyReport({ companyName = "目标公司", structure }) {
  const dimensions = structure?.workforceDimensions || {};
  const total = structure?.summary?.postingCount || 0;
  const role = largest(dimensions.roleFamilies);
  const city = largest(dimensions.cities);
  const experience = largest(dimensions.experience);
  const compensation = dimensions.compensation?.nonInternMonthly || {};
  const nonIntern = structure?.summary?.populationSegments?.nonIntern?.postingCount || 0;
  const internship = structure?.summary?.populationSegments?.internship?.postingCount || 0;
  const panels = buildTalentDataPanels(structure);
  const summary = buildTalentAttentionSummary(structure);
  return [
    `# ${companyName}人才数据分析报告`,
    "",
    "## 思维导图",
    "```mermaid",
    "mindmap",
    `  root((${companyName}人才数据))`,
    "    人才结构",
    "    地域与布局",
    "    经验与梯队",
    "    薪酬与用工",
    "    能力配置",
    "```",
    "",
    panels,
    "",
    `## 人才结构｜${role ? `${role.value}构成可见岗位中的最大角色族` : "未观察到可比较的角色结构"}`,
    role ? `在 ${total} 个岗位中，${role.value}有 ${role.postingCount} 个。该结构说明公开岗位同时覆盖多类职能；是否服务同一项目或对应编制扩张，仍需结合具体岗位归属核实。` : "岗位快照不足以形成角色族比较。",
    "",
    `## 地域与布局｜${city ? `${city.value}是岗位最多城市` : "未观察到可比较的城市分布"}`,
    city ? `${city.value}有 ${city.postingCount} 个岗位。多地同时出现岗位只说明公开招聘覆盖不同城市，不能直接推断团队分工或总部/区域布局。` : "岗位快照未提供足以比较的城市信息。",
    "",
    `## 经验与梯队｜${experience ? `${experience.value}是非实习岗位中最常见的经验要求` : "经验要求未形成可比层级"}`,
    experience ? `非实习岗位 ${nonIntern} 个，其中 ${experience.value}有 ${experience.postingCount} 个；实习岗位 ${internship} 个。该组合可用于盘点公开可见的人才梯队，不代表实际团队年龄或资历结构。` : "未观察到可比较的经验要求。",
    "",
    "## 薪酬与用工｜按公开口径拆开比较",
    `非实习可解析月薪 ${compensation.postingCount || 0} 个，月薪区间中点 P50 为 ${Number.isFinite(compensation.medianMidpointK) ? `${compensation.medianMidpointK.toFixed(1)}K` : "未观察到"}。角色、城市和经验切片，以及实习日薪/时薪，均以数据面板为准且不互相换算；可据此检查同类岗位薪酬带是否存在结构差异。`,
    "",
    "## 能力配置｜从明确要求而非常识判断",
    "数据面板仅统计岗位详情中明确出现的技能或要求。高频标签说明它在公开岗位中出现较多，不等于团队已经具备该能力，也不等于所有岗位的统一标准。",
    "",
    "## 依据与限制",
    `- 基于本次公开岗位快照中的 ${total} 个岗位及已采集 JD；角色、城市、经验、薪酬与用工口径见数据面板。`,
    "- 公开岗位无法确认实际编制、招聘优先级、个人实际薪酬或团队既有能力。",
    "",
    summary,
  ].join("\n");
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--structure");
  const outputIndex = args.indexOf("--output");
  const companyIndex = args.indexOf("--company");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (!inputPath || !outputPath) throw new Error("用法: node render-talent-strategy-report.mjs --structure <talent-structure.json> --output <talent-strategy-report.md> [--company <公司名>]");
  const structure = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, renderTalentStrategyReport({ companyName: companyIndex >= 0 ? args[companyIndex + 1] : "目标公司", structure }), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { renderTalentStrategyReport };
