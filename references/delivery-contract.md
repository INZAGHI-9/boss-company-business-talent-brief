# 业务与人才画像交付合同

每次生成使用自包含目录，至少包含：

```text
analysis-input.json
talent-structure.json
business-data-panels.md
talent-data-panels.md
talent-attention-summary.md
business-evidence-ledger.json
talent-evidence-ledger.json
business-strategy-report.md
talent-strategy-report.md
evidence-map.json
report-index.json
manifest.json
```

两份证据账本分别声明 `branch: "business"` 或 `branch: "talent"`，并各自包含 `claims`。它们都必须覆盖全量 JD，保留 `jobId`、`jobUrl`、`sourceExcerpt`、替代解释、证据缺口和未形成判断的岗位。`evidence-map.json` 汇总覆盖、来源与缺口，不得向任一分支提供另一分支的主题或结论。

`report-index.json` 的每条 claim 标明 `branch` 为 `business` 或 `talent`、引用本分支账本的 claim ID，以及 `generationIsolation: "isolated"`。`manifest.json` 记录有效 ISO `generatedAt`、快照状态、同目录相对文件名，以及两个分支的隔离声明。

两份读者正文必须遵守 [读者语言合同](reader-language-contract.md)：业务报告以经营机制与取舍组织，人才数据分析报告以角色、地域、经验、薪酬与用工、能力配置和实习梯队的数据洞察组织。业务报告的 Mermaid 思维导图后必须完整嵌入 `business-data-panels.md`；人才报告的 Mermaid 思维导图后必须完整嵌入 `talent-data-panels.md`，报告结尾必须完整嵌入 `talent-attention-summary.md`。交付校验会从业务账本和 `talent-structure.json` 重建并逐字比对这些内容。数据口径、字段说明、链接索引和限制说明集中于 `## 依据与限制`。两份报告都必须以 Mermaid 思维导图开始；都必须区分直接事实、判断、替代解释和反证缺口。
