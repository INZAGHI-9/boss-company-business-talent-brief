import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBusinessStrategyReport } from "../scripts/render-business-strategy-report.mjs";

test("uses the current ledger to render business-language themes without a company-specific sample", () => {
  const report = renderBusinessStrategyReport({
    companyName: "示例公司",
    ledger: {
      coverage: { totalJobs: 2 },
      claims: [
        { jobId: "x1", title: "会员支付产品负责人", jobUrl: "https://example.com/x1", businessObject: "交易与商业化", marketOrUser: "付费用户", actionCategory: "交易、权益或变现链路", sourceExcerpt: "负责会员交易和权益", status: "直接事实" },
        { jobId: "x2", title: "招聘负责人", jobUrl: "https://example.com/x2", businessObject: "未形成业务对象判断", marketOrUser: "未观察到", actionCategory: "无", sourceExcerpt: "负责招聘", status: "未形成判断" },
      ],
    },
  });
  assert.match(report, /# 示例公司业务战略报告/);
  assert.match(report, /## 业务证据看板/);
  assert.match(report, /把订阅、交易履约与广告变现看作可复用的收入能力/);
  assert.match(report, /可能的经营含义/);
  assert.match(report, /替代解释/);
  assert.match(report, /https:\/\/example\.com\/x1/);
  assert.doesNotMatch(report, /https:\/\/example\.com\/x2/);
});
