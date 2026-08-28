---
name: boss-company-business-talent-brief
description: Use when analyzing a company's public Boss job snapshot into evidence-bounded business strategy and talent strategy reports, without sales-entry analysis.
---

# 公司业务与人才画像

将目标公司的全量公开 Boss 岗位与完整 JD，分别转为面向业务负责人和组织/招聘负责人的两份报告。只陈述可追溯的招聘侧事实和判断，不分析我方产品、客户开发或采购机会。

## 输入与采集

需要 `target_company`，可选 `output_dir`。调用方只提供公司名；本技能负责完成登录检查、候选主体自动选择、全量 JD 采集、两份报告和交付校验，不得要求用户自行运行采集、分析或报告步骤。采集必须使用本技能内置的最新版 `scripts/collector/boss-company-scout.mjs`：它通过原生 CDP 控制专用的真实 Chrome，使用固定工作页读取页面右侧已渲染 JD，并独立保存本机登录态。`scripts/boss-company-scout.mjs` 仅作为兼容转发入口。先读取 [采集合同](references/collection-contract.md)，按“登录检查 -> 候选主体 -> 动态职位类型 -> 全量 JD”取得 `analysis-input.json`、`talent-structure.json` 和人才数据面板；不得回退到应用内浏览器、Playwright 或其他采集方式。登录、验证码和安全验证只能由用户处理。主体有歧义时不得中断或请求人工选择，必须采用采集合同的稳定规则自动选择，并在报告的数据校准处展示候选主体和置信度。全量 JD 未完整采集时必须修复或明确失败，不能以部分快照开始报告。

## 分析与写作

读取 [执行指引](references/agent-guide.md)、[人才报告中间层合同](references/talent-report-contract.md)、[分支证据账本合同](references/branch-ledger-contract.md)、[读者语言合同](references/reader-language-contract.md)、[报告提示词](references/business-talent-prompts.md) 和[交付合同](references/delivery-contract.md)。`analysis-input.json` 是不可变的唯一事实源；单个 JD 只能支持直接事实，不能单独升级为战略判断。业务分支以 `business-evidence-ledger.json` 自动生成 `business-data-panels.md`，将业务对象、岗位数、百分比、全量岗位链接和职责原文固定为业务报告的唯一横向证据来源；业务报告必须原样嵌入该面板。人才分支以 `talent-structure.json` 作为岗位、JD 模板、薪资、实习/非实习、技能、能力证据和关键词的结构化底座；薪酬必须将非实习月薪、实习日薪、时薪和面议/未解析状态分开，并读取自动生成的 `talent-data-panels.md` 作为表格、统计图和百分比的唯一来源，以及 `talent-attention-summary.md` 作为报告结尾的“值得关注”提炼。

两个独立分支并行生成，且各自从完整原始快照独立建账、独立横向分析：

- 业务战略报告：增长动作、经营押注、取舍和待验证的商业事实。
- 人才数据分析报告（历史上也称“人才战略报告”，文件名仍为 `talent-strategy-report.md`）：角色结构、地域分布、经验层级、薪酬与用工、能力配置和实习梯队的事实与洞察。

业务分支只读取原始快照、`business-evidence-ledger.json` 与其由账本生成的 `business-data-panels.md`；使用 `scripts/render-business-strategy-report.mjs` 从这三项生成稳定的业务报告骨架，再按当次岗位职责补强业务语言，但不得改动面板、岗位引用、替代解释和验证问题。人才分支只读取原始快照、`talent-structure.json` 与 `talent-evidence-ledger.json`。二者不得读取或改写另一分支的账本、主题、标题或正文。每份报告在自己的生成调用中自检后直接交付，不启动额外审核。

## 交付

读取 [交付位置预设](references/delivery-policy.md)。先在对话中呈现两份报告，再写入可用目录：

- `business-strategy-report.md`
- `talent-strategy-report.md`
- `analysis-input.json`
- `talent-structure.json`
- `business-data-panels.md`
- `talent-data-panels.md`
- `talent-attention-summary.md`
- `business-evidence-ledger.json`
- `talent-evidence-ledger.json`
- `evidence-map.json`
- `report-index.json`
- `manifest.json`

每份报告以可渲染的 Mermaid 思维导图开始，目标公司判断附可跳转岗位链接。业务报告正文必须原样嵌入 `business-data-panels.md`，其中每个主题的全量岗位链接与职责原文必须保留，使经营判断可追溯；人才报告在思维导图后原样嵌入 `talent-data-panels.md`；其中“角色族岗位引用”必须保留全量岗位名称和岗位链接，使角色归类可追溯；每张统计图后必须保留其“图表洞察”，再由正文解释；报告结尾原样嵌入 `talent-attention-summary.md`。不得手算、删改图表、百分比、引用或摘要。交付前运行 `node scripts/validate-delivery.mjs --dir <报告目录>`；无法写入目录时，直接交付并说明未运行目录校验。
