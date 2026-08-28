import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function percentage(count, total) {
  if (!Number.isFinite(total) || total <= 0) return "未观察到";
  return `${((count / total) * 100).toFixed(1)}% (${count}/${total})`;
}

function markdownTable(headers, entries) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...entries.map(entry => `| ${entry.join(" | ")} |`),
  ].join("\n");
}

function pieChart(values) {
  const slices = values
    .filter(item => item.count > 0)
    .map(item => `  "${item.businessObject.replaceAll('"', "'")}" : ${item.count}`);
  return ["```mermaid", "pie showData", "  title 可观察业务对象分布", ...(slices.length ? slices : ["  \"未观察到\" : 0"]), "```"].join("\n");
}

function groupedDirectClaims(ledger) {
  const claims = Array.isArray(ledger?.claims) ? ledger.claims : [];
  const groups = new Map();
  for (const claim of claims) {
    if (claim?.status !== "直接事实" || !claim.businessObject || claim.businessObject === "未形成业务对象判断") continue;
    const current = groups.get(claim.businessObject) || [];
    current.push(claim);
    groups.set(claim.businessObject, current);
  }
  return [...groups.entries()]
    .map(([businessObject, claimsForObject]) => ({
      businessObject,
      claims: claimsForObject.sort((left, right) => String(left.title).localeCompare(String(right.title), "zh-CN")),
      count: claimsForObject.length,
      actionCategories: [...new Set(claimsForObject.map(claim => claim.actionCategory).filter(Boolean))],
      markets: [...new Set(claimsForObject.map(claim => claim.marketOrUser).filter(Boolean))],
    }))
    .sort((left, right) => right.count - left.count || left.businessObject.localeCompare(right.businessObject, "zh-CN"));
}

function jobReference(claim) {
  const title = String(claim.title || claim.jobId || "未观察到岗位").replaceAll("[", "\\[").replaceAll("]", "\\]");
  return claim.jobUrl ? `[${title}](${claim.jobUrl})` : title;
}

function themeMeaning(group) {
  const actions = group.actionCategories.join("、") || "未观察到明确动作";
  const market = group.markets.join("、") || "未观察到明确对象";
  return `可观察对象：${market}；可观察动作：${actions}。`;
}

function buildBusinessDataPanels(ledger) {
  const total = Number(ledger?.coverage?.totalJobs) || (Array.isArray(ledger?.claims) ? ledger.claims.length : 0);
  const groups = groupedDirectClaims(ledger);
  const directCount = groups.reduce((sum, group) => sum + group.count, 0);

  return [
    "## 业务证据看板",
    "",
    `统计口径：全部岗位 ${total} 个；可形成业务主题的直接事实 ${directCount} 个，占 ${percentage(directCount, total)}。其余岗位保留在业务账本中，但未纳入主题推导。`,
    "",
    "### 可观察业务对象",
    markdownTable(["业务对象", "岗位数", "占全部岗位", "可观察动作", "面向对象"], groups.map(group => [
      group.businessObject,
      group.count,
      percentage(group.count, total),
      group.actionCategories.join("、"),
      group.markets.join("、"),
    ])),
    "",
    pieChart(groups),
    "",
    "### 主题证据与岗位引用",
    "",
    ...groups.flatMap(group => [
      `#### ${group.businessObject}`,
      `${group.count} 个岗位，占全部岗位 ${percentage(group.count, total)}。${themeMeaning(group)}`,
      "",
      "#### 业务主题岗位引用",
      ...group.claims.map(claim => `- ${jobReference(claim)}：${claim.sourceExcerpt || "未观察到职责原文"}`),
      "",
    ]),
  ].join("\n");
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (!inputPath || !outputPath) throw new Error("用法: node render-business-data-panels.mjs --input <business-evidence-ledger.json> --output <business-data-panels.md>");
  const ledger = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, buildBusinessDataPanels(ledger), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { buildBusinessDataPanels };
