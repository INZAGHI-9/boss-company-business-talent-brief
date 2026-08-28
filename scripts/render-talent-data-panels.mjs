import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function percentage(count, total) {
  if (!Number.isFinite(total) || total <= 0) return "未观察到";
  return `${((count / total) * 100).toFixed(1)}% (${count}/${total})`;
}

function rows(values) {
  return Array.isArray(values) && values.length > 0 ? values : [{ value: "未观察到", postingCount: 0 }];
}

function markdownTable(headers, entries) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...entries.map(entry => `| ${entry.join(" | ")} |`),
  ].join("\n");
}

function pieChart(title, values) {
  const slices = rows(values)
    .filter(item => item.postingCount > 0)
    .map(item => `  \"${String(item.value).replaceAll('"', "'")}\" : ${item.postingCount}`);
  return ["```mermaid", "pie showData", `  title ${title}`, ...(slices.length > 0 ? slices : ["  \"未观察到\" : 0"]), "```"].join("\n");
}

function countFor(structure, population) {
  return structure?.summary?.populationSegments?.[population]?.postingCount
    ?? structure?.workforceDimensions?.salaryCoverage?.[population]?.totalPostingCount
    ?? 0;
}

function isCapabilitySignal(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/现场办公|不接受.*居家|周末双休|五险一金|年终奖|带薪假期|车补|房补|餐补|甲方公司|文化娱乐|数字科技|^其他$/.test(text);
}

function largest(values) {
  return [...rows(values)].sort((left, right) => right.postingCount - left.postingCount || String(left.value).localeCompare(String(right.value), "zh-CN"))[0];
}

function amount(value, unit) {
  return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "未观察到";
}

function middleFifty(range, unit) {
  return Number.isFinite(range?.low) && Number.isFinite(range?.high)
    ? `${amount(range.low, unit)}-${amount(range.high, unit)}`
    : "未观察到";
}

function compensationProfileRows(profiles) {
  return rows(profiles).map(item => [
    item.value,
    item.postingCount,
    amount(item.medianMidpointK, "K"),
    middleFifty(item.middleFiftyRangeK, "K"),
    item.withSalaryMonthsCount ?? 0,
  ]);
}

function roleEvidenceIndex(roleFamilies, postings) {
  const postingsById = new Map((Array.isArray(postings) ? postings : []).map(posting => [posting.jobId, posting]));
  return rows(roleFamilies).map(role => {
    const references = (role.jobIds || []).map(jobId => {
      const posting = postingsById.get(jobId);
      if (!posting) return `未观察到岗位 ${jobId}`;
      const title = String(posting.title || jobId).replaceAll("[", "\\[").replaceAll("]", "\\]");
      return posting.url ? `[${title}](${posting.url})` : title;
    });
    return `- ${role.value}（${role.postingCount}个岗位）：${references.length > 0 ? references.join("、") : "未观察到可引用岗位"}`;
  });
}

function roleChartInsight(values, total) {
  const largestRole = largest(values);
  if (!largestRole || largestRole.postingCount <= 0) return "图中未观察到可用于比较的角色岗位数。";
  const smallestRole = [...rows(values)].sort((left, right) => left.postingCount - right.postingCount)[0];
  const spread = total > 0 ? (((largestRole.postingCount - smallestRole.postingCount) / total) * 100).toFixed(1) : "0.0";
  const intent = Number(spread) <= 15
    ? "角色需求分布接近，可能是在并行补充多类职能，而非单一岗位族扩张。"
    : `${largestRole.value}明显高于其他角色，可能是在补充这一专业能力，但仍需结合岗位归属确认是否指向重点项目。`;
  const question = Number(spread) <= 15
    ? "这些角色是否服务于同一批重点项目，还是独立的常规补缺。"
    : `${largestRole.value}岗位是集中服务于同一批项目，还是分散的常规补缺。`;
  return `${largestRole.value}为最大角色族，占全部岗位 ${percentage(largestRole.postingCount, total)}；最高与最低角色族相差 ${spread} 个百分点。\n\n可能的招聘侧意图：${intent}\n\n最该验证：${question}`;
}

function cityChartInsight(values, total) {
  const largestCity = largest(values);
  if (!largestCity || largestCity.postingCount <= 0) return "图中未观察到可用于比较的城市岗位数。";
  const topCities = rows(values).filter(item => item.postingCount > 0).slice(0, 3);
  const topCount = topCities.reduce((sum, item) => sum + item.postingCount, 0);
  return `${largestCity.value}为岗位最多城市，占全部岗位 ${percentage(largestCity.postingCount, total)}；前 ${topCities.length} 个城市合计占 ${percentage(topCount, total)}。\n\n可能的招聘侧意图：公开招聘可能同时使用多个城市的人才供给，而不是依赖单一城市；是否对应团队分工仍需结合岗位归属确认。\n\n最该验证：各城市承担的是同类岗位的分散招聘，还是不同职能或业务线的集中配置。`;
}

function salaryChartInsight(compensation) {
  const monthly = compensation?.nonInternMonthly || {};
  const largestBand = largest(monthly.midpointBands);
  if (!largestBand || largestBand.postingCount <= 0 || !Number.isFinite(monthly.medianMidpointK)) {
    return "图中未观察到可用于比较的非实习月薪区间。";
  }
  return `非实习可解析月薪中，区间中点 P50 为 ${amount(monthly.medianMidpointK, "K")}；${largestBand.value}为岗位最多的中点带，占可解析非实习月薪 ${percentage(largestBand.postingCount, monthly.postingCount)}。\n\n可能的招聘侧意图：公开月薪中点集中在这一带，可能反映常规岗位的薪酬带设置；是否存在因角色、城市或经验造成的分层，需在切片中核实。\n\n最该验证：同一角色、同一城市、相近经验下的薪酬带是否仍有明显差异，而不是把跨角色的工资差异误读为统一的薪酬策略。`;
}

function buildTalentAttentionSummary(structure) {
  const total = structure?.summary?.postingCount ?? structure?.workforceDimensions?.salaryCoverage?.totalPostingCount ?? 0;
  const dimensions = structure?.workforceDimensions || {};
  const nonIntern = countFor(structure, "nonIntern");
  const internship = countFor(structure, "internship");
  const items = [];
  const largestRole = largest(dimensions.roleFamilies);
  if (largestRole?.postingCount > 0) {
    const smallestRole = [...rows(dimensions.roleFamilies)].sort((left, right) => left.postingCount - right.postingCount)[0];
    const roleSpread = total > 0 ? ((largestRole.postingCount - smallestRole.postingCount) / total) * 100 : 0;
    const intent = roleSpread <= 15
      ? "多类角色接近，可能反映并行配置多种职能。"
      : `最大角色族高于其他角色，可能反映对${largestRole.value}的重点补充。`;
    items.push(`角色结构：${largestRole.value}为最大角色族，占全部岗位 ${percentage(largestRole.postingCount, total)}；可能的招聘侧意图：${intent}`);
  }
  const largestCity = largest(dimensions.cities);
  if (largestCity?.postingCount > 0) items.push(`地域分布：${largestCity.value}为岗位最多城市，占全部岗位 ${percentage(largestCity.postingCount, total)}；可能的招聘侧意图：同时覆盖多个城市的人才供给，需核实是否对应明确的团队分工。`);
  const largestExperience = largest(dimensions.experience);
  if (largestExperience?.postingCount > 0) items.push(`经验与用工：非实习岗位中 ${largestExperience.value}为最大经验层级，占 ${percentage(largestExperience.postingCount, nonIntern)}；实习岗位占全部岗位 ${percentage(internship, total)}。可能的招聘侧意图：以中段经验人才作为可见的执行层补充，并保留实习入口。`);
  const monthlyCompensation = dimensions.compensation?.nonInternMonthly;
  if (monthlyCompensation?.postingCount > 0 && Number.isFinite(monthlyCompensation.medianMidpointK)) {
    items.push(`薪酬结构：非实习可解析月薪的区间中点 P50 为 ${amount(monthlyCompensation.medianMidpointK, "K")}；中间 50% 位于 ${middleFifty(monthlyCompensation.middleFiftyRangeK, "K")}。可能的招聘侧意图：岗位可能存在以常规薪酬带为主的配置，需继续按角色、城市和经验排除结构差异。`);
  }
  const skills = [...(structure?.talentSignals?.skills || [])]
    .map(signal => ({ value: signal.value, postingCount: new Set(signal.jobIds || []).size }))
    .filter(signal => isCapabilitySignal(signal.value));
  const largestSkill = largest(skills);
  if (largestSkill?.postingCount > 0) items.push(`能力配置：${largestSkill.value}是覆盖岗位数最多的能力标签，占全部岗位 ${percentage(largestSkill.postingCount, total)}。可能的招聘侧意图：该能力可能跨越多个角色出现，应继续拆看角色组合，而不是视为全体岗位的统一标准。`);
  return ["## 值得关注", "", ...items.map(item => `- ${item}`), ""].join("\n");
}

function buildTalentDataPanels(structure) {
  const total = structure?.summary?.postingCount ?? structure?.workforceDimensions?.salaryCoverage?.totalPostingCount ?? 0;
  const dimensions = structure?.workforceDimensions || {};
  const nonIntern = countFor(structure, "nonIntern");
  const internship = countFor(structure, "internship");
  const skills = [...(structure?.talentSignals?.skills || [])]
    .map(signal => ({ value: signal.value, postingCount: new Set(signal.jobIds || []).size }))
    .filter(signal => isCapabilitySignal(signal.value))
    .sort((left, right) => right.postingCount - left.postingCount || String(left.value).localeCompare(String(right.value), "zh-CN"))
    .slice(0, 10);
  const salaryCoverage = dimensions.salaryCoverage || {};
  const compensation = dimensions.compensation || {};
  const monthlyCompensation = compensation.nonInternMonthly || {};
  const dailyCompensation = compensation.internshipDaily || {};

  return [
    "## 人才数据看板",
    "",
    `统计口径：全部岗位 ${total} 个；百分比均以表内明确分母计算。`,
    "",
    "### 角色结构",
    markdownTable(["角色族", "岗位数", "占全部岗位"], rows(dimensions.roleFamilies).map(item => [item.value, item.postingCount, percentage(item.postingCount, total)])),
    "",
    pieChart("角色结构分布", dimensions.roleFamilies),
    "",
    "#### 图表洞察：角色结构",
    roleChartInsight(dimensions.roleFamilies, total),
    "",
    "#### 角色族岗位引用",
    ...roleEvidenceIndex(dimensions.roleFamilies, structure?.postings),
    "",
    "### 地域分布",
    markdownTable(["城市", "岗位数", "占全部岗位"], rows(dimensions.cities).map(item => [item.value, item.postingCount, percentage(item.postingCount, total)])),
    "",
    pieChart("地域分布", dimensions.cities),
    "",
    "#### 图表洞察：地域分布",
    cityChartInsight(dimensions.cities, total),
    "",
    "### 经验与用工",
    markdownTable(["非实习经验要求", "岗位数", "占非实习岗位"], rows(dimensions.experience).map(item => [item.value, item.postingCount, percentage(item.postingCount, nonIntern)])),
    "",
    markdownTable(["用工类型", "岗位数", "占全部岗位"], [["非实习", nonIntern, percentage(nonIntern, total)], ["实习", internship, percentage(internship, total)]]),
    "",
    "### 薪酬结构（非实习）",
    markdownTable(["公开口径", "岗位数", "占非实习岗位"], [
      ["可解析月薪区间", monthlyCompensation.postingCount ?? 0, percentage(monthlyCompensation.postingCount ?? 0, monthlyCompensation.totalNonInternPostingCount ?? nonIntern)],
      ["其中已观察到薪数", monthlyCompensation.withSalaryMonthsCount ?? 0, percentage(monthlyCompensation.withSalaryMonthsCount ?? 0, monthlyCompensation.postingCount ?? 0)],
      ["未观察到薪数", monthlyCompensation.withoutSalaryMonthsCount ?? 0, percentage(monthlyCompensation.withoutSalaryMonthsCount ?? 0, monthlyCompensation.postingCount ?? 0)],
    ]),
    "",
    markdownTable(["薪数", "岗位数", "占可解析非实习月薪"], rows(monthlyCompensation.salaryMonthDistribution).map(item => [item.value, item.postingCount, percentage(item.postingCount, monthlyCompensation.postingCount ?? 0)])),
    "",
    `年固定现金估算 P50：${amount(monthlyCompensation.annualizedFixedCash?.medianMidpointK, "K")}；中间 50% 为 ${middleFifty(monthlyCompensation.annualizedFixedCash?.middleFiftyRangeK, "K")}。仅按公开月薪区间中点乘以已观察薪数估算，不含奖金、福利或股权。`,
    "",
    markdownTable(["月薪区间中点", "岗位数", "占可解析非实习月薪"], rows(monthlyCompensation.midpointBands).map(item => [item.value, item.postingCount, percentage(item.postingCount, monthlyCompensation.postingCount ?? 0)])),
    "",
    pieChart("非实习月薪区间中点分布", monthlyCompensation.midpointBands),
    "",
    "#### 图表洞察：薪酬结构",
    salaryChartInsight(compensation),
    "",
    markdownTable(["月薪区间中点 P50", "中间 50%", "薪资解读口径"], [[
      amount(monthlyCompensation.medianMidpointK, "K"),
      middleFifty(monthlyCompensation.middleFiftyRangeK, "K"),
      "以每条公开月薪区间的中点计算；不是个人实际薪资或外部市场水平。",
    ]]),
    "",
    "### 薪酬切片",
    markdownTable(["角色族", "可解析月薪岗位", "区间中点 P50", "中间 50%", "已观察薪数"], compensationProfileRows(monthlyCompensation.byRoleFamily)),
    "",
    markdownTable(["城市", "可解析月薪岗位", "区间中点 P50", "中间 50%", "已观察薪数"], compensationProfileRows(monthlyCompensation.byCity)),
    "",
    markdownTable(["经验要求", "可解析月薪岗位", "区间中点 P50", "中间 50%", "已观察薪数"], compensationProfileRows(monthlyCompensation.byExperience)),
    "",
    "### 实习日薪",
    markdownTable(["公开口径", "岗位数", "占实习岗位"], [
      ["可解析日薪区间", dailyCompensation.postingCount ?? 0, percentage(dailyCompensation.postingCount ?? 0, dailyCompensation.totalInternshipPostingCount ?? internship)],
      ["时薪岗位", compensation.hourlyPostingCount ?? 0, percentage(compensation.hourlyPostingCount ?? 0, internship)],
    ]),
    "",
    markdownTable(["日薪区间中点", "岗位数", "占可解析实习日薪"], rows(dailyCompensation.midpointBands).map(item => [item.value, item.postingCount, percentage(item.postingCount, dailyCompensation.postingCount ?? 0)])),
    "",
    `实习日薪区间中点 P50：${amount(dailyCompensation.medianMidpointRmb, "元/天")}。时薪岗位 ${compensation.hourlyPostingCount ?? 0} 个，未与月薪或日薪混合比较。`,
    "",
    "### 能力配置",
    markdownTable(["岗位明确技能或要求", "覆盖岗位数", "占全部岗位"], rows(skills).map(item => [item.value, item.postingCount, percentage(item.postingCount, total)])),
    "",
    "### 实习梯队",
    markdownTable(["实习到岗要求", "岗位数", "占实习岗位"], rows(dimensions.internshipCommitment).map(item => [item.value, item.postingCount, percentage(item.postingCount, internship)])),
    "",
  ].join("\n");
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");
  const summaryIndex = args.indexOf("--summary-output");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const summaryPath = summaryIndex >= 0 ? args[summaryIndex + 1] : null;
  if (!inputPath || !outputPath) throw new Error("用法: node render-talent-data-panels.mjs --input <talent-structure.json> --output <talent-data-panels.md>");
  const structure = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, buildTalentDataPanels(structure), "utf8");
  if (summaryPath) await writeFile(summaryPath, buildTalentAttentionSummary(structure), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { buildTalentAttentionSummary, buildTalentDataPanels };
