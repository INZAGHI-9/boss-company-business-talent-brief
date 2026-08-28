# Boss 岗位采集合同

本合同让不同 Agent、不同操作系统通过本技能内置的采集器产出同一份分析输入。采集方式固定，输入质量要求相同。

## 固定采集器

只能运行当前技能目录中的 `scripts/collector/boss-company-scout.mjs`。根目录的 `scripts/boss-company-scout.mjs` 仅为兼容转发入口。新版采集器使用原生 CDP 控制专用的真实 Google Chrome，并在本机独立用户目录中保存登录态；它不依赖当前项目、其他技能目录、应用内浏览器或第三方浏览器自动化。

运行前需要 Node.js 20.11+ 和本机 Google Chrome。先运行：

```bash
node <skill-dir>/scripts/collector/boss-company-scout.mjs --check-login
```

登录状态不可用时，运行：

```bash
node <skill-dir>/scripts/collector/boss-company-scout.mjs --login-only
```

用户必须在打开的专用真实 Chrome 中手动登录。用户确认后，再次运行 `--check-login`；成功后才能搜索或采集。若内置脚本、Node.js 或 Chrome 不可用，停止并说明缺失项，不得回退到应用内浏览器、Playwright、browser-act、其他技能或项目内脚本。

不得复制 Cookie、读取账号密码或验证码、伪造设备信息、轮换代理，或绕过 Boss 的安全验证。遇到验证或限制时暂停，等待用户手动恢复。

## 采集顺序

1. 通过 `--check-login` 检查专用真实 Chrome 的登录态；未登录时仅用 `--login-only` 打开登录页并等待用户手动完成。
2. 用 `--company "目标公司"` 搜索候选主体，保存候选名称、Boss `brandId` 和公司主页链接。名称相似时，按公司名匹配度、公开岗位卡数量和稳定排序自动选择，不向用户请求选择；将全部候选、选择依据和置信度写入快照。低置信度仍继续采集，但必须在报告数据校准处提示。
3. 以自动选择的 `brandId` 从公司招聘页动态读取职位类型，排除“全部”后逐类遍历到真实末页；以固定 3 个可复用工作页读取页面右侧已渲染 JD，不等待详情接口。单页卡片消失时继续读取同页其他卡片；全部单页续采后最多刷新列表一次。页面出现访问受限、异常行为、验证或登录失效时立即暂停，保留页面和断点，等待用户前台恢复。
4. 将采集器输出的 `analysis-input.json`、`talent-structure.json`、`talent-data-panels.md` 和 `talent-attention-summary.md` 复制到本次交付目录。保留采集状态；只有完整快照才能开始本技能的业务与人才报告，`tolerated_gap` 或 `partial` 必须明确失败，不得从部分快照开始分析或交付报告。

## 完整性

能确认公司页公布岗位总数时，只有以下条件同时成立才可标为完整快照：

- 每个可见职位类型均已遍历至真实末页；
- 按岗位唯一标识去重后的数量等于公司页公布总数；
- 每个纳入岗位都有岗位链接和非空 JD。

平台没有提供岗位总数时，记录实际分页结束依据并标为“可见岗位快照”，不要声称全国全部岗位。

## 标准分析输入

分析开始前生成 `analysis-input.json`。字段名可按当前 Agent 的实现调整，但必须包含以下信息：

```json
{
  "company": {
    "name": "目标公司名称",
    "brandId": "平台主体标识或 null",
    "companyUrl": "公司主页链接或 null"
  },
  "snapshot": {
    "collectedAt": "ISO 时间",
    "status": "complete | partial | visible_snapshot",
    "publishedJobCount": 0,
    "deduplicatedJobCount": 0,
    "limitation": "采集限制"
  },
  "jobs": [
    {
      "jobId": "岗位唯一标识",
      "title": "岗位名称",
      "url": "岗位详情链接",
      "location": "城市或地区",
      "salary": "薪资原文或 null",
      "employmentMode": "用工方式或 null",
      "description": "完整 JD 原文"
    }
  ]
}
```

原始岗位内容必须保留在当前 Agent 的授权工作区，不得作为无关样本、日志或公开材料传播。保存分析输入与报告时，按 [交付位置预设](delivery-policy.md) 选择目录。
