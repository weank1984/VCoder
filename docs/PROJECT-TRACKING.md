# VCoder 进度管理与发布流程

**最后更新**: 2026-01-11  
**适用范围**: V0.5 Beta → V1.0

---

## 1. 文档分工（单一真相）

- 路线图/优先级：`docs/V0.2/DEVELOPMENT-ROADMAP.md`
- 当前进度/阶段百分比：`docs/V0.2/OVERALL-PROGRESS.md`
- 产品范围与验收：`docs/V0.2/PRD.md`
- 技术架构与设计决策：`docs/V0.2/TECH-SOLUTION.md`
- 阶段完成报告：`docs/V0.2/PHASE*-COMPLETION-REPORT.md`

原则：计划变更先改 PRD/路线图；实现落地后补技术方案与进度；完成阶段再写完成报告。

---

## 2. 迭代节奏（建议）

- 每周一次（或每个里程碑结束时）更新：
  - `OVERALL-PROGRESS.md` 的 “当前版本/总体完成度/技术债务/下一步行动”
  - `DEVELOPMENT-ROADMAP.md` 的 “Milestone A/B 的 P0/P1 清单”
- 每次功能范围变更（增删 P0）更新：
  - `PRD.md` 的 “后续版本目标/验收标准”
- 每次关键技术决策变更更新：
  - `TECH-SOLUTION.md` 的 “实现差异/待补齐设计”

---

## 3. 状态口径（建议）

对任务/条目统一使用：
- `planned`：已决定要做，但未开始
- `in_progress`：已开始（最好能指到代码路径/PR）
- `done`：已合入并可验收
- `cut`：明确不做（写原因）
- `defer`：推迟到后续版本（写目标版本）

---

## 4. 里程碑验收（建议）

### V0.6 RC（Phase 3 收尾）
- P0 清单全部为 `done` 或 `cut`（且有替代方案/降级路径）
- “关键路径回归”通过：建会话 → 审批 → 终端输出 → diff 审阅 → 写入落盘 → 导出日志/审计
- 长会话与大文件场景不会卡死（可降级）

### V1.0（发布质量）
- 文档齐备：安装/配置/权限/安全/排错/FAQ
- 最小 E2E 可跑（至少覆盖 1 条关键路径）
- 可诊断性：出问题时能导出足够排查的日志/审计包

---

## 5. 发布清单（建议）

### RC/Beta
- 版本号更新（extension package + changelog，如有）
- 关键回归清单勾完
- 已知问题列表（Known Issues）明确

### Marketplace（V1.0）
- `node-pty` 平台兼容验证（macOS/Linux/Windows）
- 扩展体积与启动性能检查
- 安全说明（权限、Workspace Trust、审计/脱敏策略）
- 演示与截图（如需要）
