import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildBusinessDataPanels } from "./render-business-data-panels.mjs";

const narratives = {
  "交易与商业化": {
    title: "把订阅、交易履约与广告变现看作可复用的收入能力",
    conclusion: "公开岗位同时出现订阅产品、交易/支付研发、商业化产品、广告销售和投放动作，呈现出从收入产品设计、履约到获客和客户变现的多段工作链。",
    implication: "更值得关注的不是单一收入岗位，而是这些动作是否由共用的交易与权益能力连接起来；若成立，取舍会落在统一能力的复用效率与各产品线灵活性之间。",
    alternative: "也可能是多个独立产品或广告业务的常规补缺，不能仅凭岗位数量判断其已形成统一中台或收入增长结果。",
    question: "订阅、支付、权益和广告资源分别服务哪些产品线？交易能力是否有共用的产品、技术和运营负责人？",
  },
  "全球化产品与市场": {
    title: "把区域市场反馈、本地化交付和增长动作接成海外经营闭环",
    conclusion: "公开岗位覆盖区域市场运营、本地化产品/设计、海外增长、用户反馈和搜索/渠道动作，说明海外经营至少同时需要市场获客、产品适配与用户运营的协作。",
    implication: "若这些职责围绕相同地区或产品协同，关键取舍会是区域差异的响应速度与总部能力复用之间如何平衡，而不是只看海外投放规模。",
    alternative: "也可能是不同国家、不同产品的独立团队招聘，岗位快照不足以确认是否存在统一的区域经营机制。",
    question: "区域市场、产品本地化与端内运营是否以同一国家/产品单元为边界？本地团队对产品迭代和订阅转化拥有多大决策权？",
  },
  "影像与 AI 产品交付": {
    title: "把算法、效果设计、产品体验与工程平台连成 AI 影像交付链",
    conclusion: "公开岗位同时涉及视觉/生成算法、效果设计、AI 产品、模型服务和性能工程，能够观察到从能力研发到产品效果与工程化承接的多个环节。",
    implication: "这类组合可能意味着业务的难点不只在模型或创意本身，还在将效果质量、推理成本、稳定性和用户体验同时落到产品；实际取舍需要看不同环节是否共享版本目标。",
    alternative: "也可能是研究、平台和多个产品团队各自的常规技术招聘，不能将其直接写成单一 AI 战略或已验证的产品成效。",
    question: "算法研究、模型服务和效果/产品团队是否围绕同一批产品版本协作？各环节如何在效果质量、时延与成本之间作取舍？",
  },
  "内容与生态": {
    title: "通过供稿、创作者与校园运营补充内容和合作供给",
    conclusion: "公开岗位包含供稿设计、创作者/校园生态、社媒与内容产品等动作，能看到平台并非只依赖内部生产，也在组织外部内容或合作供给。",
    implication: "如果这些入口服务同一产品链路，经营上的关键会从单纯获取供给转向供给质量、激励成本和平台规则之间的平衡。",
    alternative: "也可能是面向不同产品和人群的零散运营岗位，不能据此确认供给规模、活跃度或生态商业化效果。",
    question: "供稿、创作者和校园运营分别补充哪类内容或用户？激励、审核和内容分发由谁负责，是否共享同一质量指标？",
  },
};

function businessObjects(ledger) {
  return [...new Set((ledger?.claims || [])
    .filter(claim => claim?.status === "直接事实" && claim.businessObject && claim.businessObject !== "未形成业务对象判断")
    .map(claim => claim.businessObject))];
}

function fallbackNarrative(name) {
  return {
    title: `围绕${name}组织可观察的产品、市场或交付动作`,
    conclusion: `公开岗位在${name}下出现多个可追溯动作，说明这一对象需要不止一种职能参与。`,
    implication: "需要进一步确认这些动作是否围绕共同的业务目标协同，以及在效率、质量或区域差异之间的实际取舍。",
    alternative: "也可能是分散的常规补缺，公开招聘不足以证明经营结果、投入规模或组织优先级。",
    question: "这些岗位服务的具体产品、市场或合作对象是什么？它们是否由同一业务单元统筹？",
  };
}

function renderBusinessStrategyReport({ companyName = "目标公司", ledger }) {
  const panels = buildBusinessDataPanels(ledger);
  const themes = businessObjects(ledger);
  const themeSections = themes.map(name => {
    const narrative = narratives[name] || fallbackNarrative(name);
    return [
      `## 经营命题｜${narrative.title}`,
      narrative.conclusion,
      "",
      `可能的经营含义：${narrative.implication}`,
      "",
      `替代解释：${narrative.alternative}`,
      "",
      `最该验证：${narrative.question}`,
      "",
    ].join("\n");
  });
  const noTheme = themes.length === 0 ? ["## 公开岗位未形成可交叉验证的业务主题", "本次完整岗位快照中未观察到足以组织为业务主题的职责组合；保留账本供后续与产品、市场或组织信息交叉验证。", ""] : [];
  return [
    `# ${companyName}业务战略报告`,
    "",
    "## 思维导图",
    "```mermaid",
    "mindmap",
    `  root((${companyName}业务观察))`,
    ...themes.map(name => `    ${name}`),
    "```",
    "",
    ...themeSections,
    ...noTheme,
    panels,
    "",
    "## 依据与限制",
    `- 基于本次公开岗位快照中的 ${ledger?.coverage?.totalJobs ?? ledger?.claims?.length ?? 0} 个岗位及其已采集 JD。`,
    "- 主题面板中的岗位数与占比用于展示公开招聘中的可观察工作对象，不代表业务收入、投入规模、组织编制或战略优先级。",
    "- 每个经营命题均保留替代解释和可区分的验证问题；需要结合产品归属、业务目标和内部负责人信息确认。",
    "",
  ].join("\n");
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--ledger");
  const outputIndex = args.indexOf("--output");
  const companyIndex = args.indexOf("--company");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const companyName = companyIndex >= 0 ? args[companyIndex + 1] : "目标公司";
  if (!inputPath || !outputPath) throw new Error("用法: node render-business-strategy-report.mjs --ledger <business-evidence-ledger.json> --output <business-strategy-report.md> [--company <公司名>]");
  const ledger = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, renderBusinessStrategyReport({ companyName, ledger }), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { renderBusinessStrategyReport };
