import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBusinessDataPanels } from "../scripts/render-business-data-panels.mjs";

test("renders a reproducible business evidence panel with complete theme citations", () => {
  const panel = buildBusinessDataPanels({
    branch: "business",
    coverage: { totalJobs: 4 },
    claims: [
      { id: "b1", jobId: "job-1", title: "订阅交易中台产品经理", jobUrl: "https://example.com/1", businessObject: "交易与商业化", marketOrUser: "付费用户", actionCategory: "交易、权益或变现链路", sourceExcerpt: "建设订阅交易与权益能力", status: "直接事实" },
      { id: "b2", jobId: "job-2", title: "海外市场运营（日本）", jobUrl: "https://example.com/2", businessObject: "全球化产品与市场", marketOrUser: "区域用户", actionCategory: "本地化、获客或跨区域交付", sourceExcerpt: "负责日本市场运营", status: "直接事实" },
      { id: "b3", jobId: "job-3", title: "招聘经理", jobUrl: "https://example.com/3", businessObject: "未形成业务对象判断", marketOrUser: "未观察到", actionCategory: "岗位原文不足以归入上述业务对象", sourceExcerpt: "负责招聘", status: "未形成判断" },
      { id: "b4", jobId: "job-4", title: "视频算法工程师", jobUrl: "https://example.com/4", businessObject: "影像与 AI 产品交付", marketOrUser: "创作用户", actionCategory: "产品、算法或工程化交付", sourceExcerpt: "研发视频生成算法", status: "直接事实" },
    ],
  });

  assert.match(panel, /## 业务证据看板/);
  assert.match(panel, /可形成业务主题的直接事实/);
  assert.match(panel, /75\.0% \(3\/4\)/);
  assert.match(panel, /```mermaid\npie showData/);
  assert.match(panel, /#### 业务主题岗位引用/);
  for (const id of ["1", "2", "4"]) assert.match(panel, new RegExp(`https://example\\.com/${id}`));
  assert.doesNotMatch(panel, /https:\/\/example\.com\/3/);
});
