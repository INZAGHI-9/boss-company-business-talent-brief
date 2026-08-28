# Boss Company Business Talent Brief

基于公开 Boss 岗位快照生成两份证据可追溯的报告：业务战略报告和人才数据分析报告。

## 关键约束

- 使用内置 Chrome/CDP 采集器，完整 JD 是分析前提。
- 业务与人才分别建立证据账本，禁止复用主题或正文。
- 业务与人才报告均保留可追溯的岗位链接和证据边界。
- 不包含原始岗位快照、报告成品、登录态、Chrome 配置或运行断点。

## 验证

```powershell
node --test test\*.test.mjs
```
