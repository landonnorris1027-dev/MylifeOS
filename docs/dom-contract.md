# DOM 契约清单

> 本文件由 `scripts/dom-contract.mjs` 从测试源码自动生成，请勿手改。
> 重新生成：`npm run contract:dom`　校验漂移：`npm run contract:dom:check`

本项目不使用 Testing Library，测试直接对渲染结果跑 `querySelector` / `closest`。
因此**选择器就是契约**：改类名、多包一层 div、删掉一个 `data-slot`，都可能让断言静默失效。
本清单把这份隐式契约摊开；分级说明的是"哪一类改动会让它断"。

## 摘要

| 项目 | 数量 | 说明 |
| --- | --- | --- |
| 选择器契约 | 91 | 测试直接查询的 DOM 选择器 |
| 依赖它们的测试文件 | 22 | 改契约的影响面 |
| 直接断言的可见文案 | 39 | 文案改动会断的断言 |
| 结构 | 5 | 依赖 DOM 层级或兄弟顺序 |
| 类名 | 32 | 依赖样式类名 |
| 组合 | 2 | 组合选择器 |
| 语义 | 39 | 依赖 role / aria-* / data-* / title 等语义属性 |
| 标签 | 13 | 只依赖标签名 |

## 文案型选择器（切语言就会失配）

这些选择器把中文文案写进了 `aria-label` / `title` 查询条件。测试固定跑在中文下，
所以今天能过；一旦测试切到英文，或界面文案被改写，它们会静默不再匹配。
改造方向：查 `[data-slot]` 或 `role`，把文案留给译文表。

| 选择器 | 使用者 |
| --- | --- |
| `[aria-label="仅删除今天"]` | `components/TaskCard.test.tsx` |
| `[aria-label="确认仅删除今天"]` | `components/TaskCard.test.tsx` |
| `[title="提前完成"]` | `components/PomodoroTimer.test.tsx` |
| `button[title="编辑习惯"]` | `components/DurationInputs.test.tsx` |
| `button[title="移出时间线"]` | `components/CompletedTaskCard.test.tsx` |

## 结构契约（最易碎：改 DOM 层级就断）

_依赖 DOM 层级或兄弟顺序 · 5 条_

| 选择器 | 使用处 | 使用者 |
| --- | --- | --- |
| `:scope > li` | 1 | `components/DesktopFocusStats.test.tsx` |
| `:scope > li > details` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.focus-history-negative > i` | 1 | `components/FocusCharts.test.tsx` |
| `.profile-pagination button:last-child` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-review-detail > div:last-child` | 1 | `components/DesktopFocusStats.test.tsx` |

## 类名契约（改样式类就断）

_依赖样式类名 · 32 条_

| 选择器 | 使用处 | 使用者 |
| --- | --- | --- |
| `.focus-history-column` | 3 | `components/DesktopFocusStats.test.tsx`<br>`components/FocusCharts.test.tsx`<br>`components/StorageBoundary.android.test.tsx` |
| `.focus-history-stack` | 1 | `components/FocusCharts.test.tsx` |
| `.focus-history-tooltip` | 1 | `components/FocusCharts.test.tsx` |
| `.focus-history-total strong` | 1 | `components/FocusCharts.test.tsx` |
| `.motion-container` | 1 | `app-views.a11y.test.tsx` |
| `.motion-focus-primary` | 1 | `components/PomodoroTimer.test.tsx` |
| `.motion-saved-actions` | 1 | `components/PomodoroTimer.test.tsx` |
| `.motion-task-focus` | 1 | `components/TaskCard.test.tsx` |
| `.profile-activity-compact` | 1 | `components/StorageBoundary.android.test.tsx` |
| `.profile-distribution-card` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-distribution-duration` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-donut` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-donut-segment` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-donut-total strong` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-donut-track` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `.profile-pagination` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-pagination button:disabled` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-period-summary` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-review` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-review-list` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-review-list details` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.profile-session-list` | 1 | `components/DesktopFocusStats.test.tsx` |
| `.rare-delete-anchor` | 1 | `components/TaskCard.test.tsx` |
| `.rare-duration-input` | 1 | `components/DurationInputs.test.tsx` |
| `.rare-duration-toggle` | 1 | `components/DurationInputs.test.tsx` |
| `.ui-btn` | 1 | `components/dialog-actions.test.tsx` |
| `.ui-command-empty` | 1 | `components/CommandPalette.test.tsx` |
| `.ui-command-input` | 1 | `components/CommandPalette.test.tsx` |
| `.ui-command-item` | 1 | `components/CommandPalette.test.tsx` |
| `.ui-command-item-label` | 1 | `components/CommandPalette.test.tsx` |
| `.ui-toast-action` | 1 | `ui/toast.test.tsx` |
| `path.profile-donut-segment` | 1 | `components/CompletedFocusDistribution.test.tsx` |

## 组合契约

_组合选择器 · 2 条_

| 选择器 | 使用处 | 使用者 |
| --- | --- | --- |
| `li strong` | 1 | `components/CompletedFocusDistribution.test.tsx` |
| `tbody tr` | 2 | `components/DesktopFocusStats.test.tsx`<br>`components/FocusCharts.test.tsx` |

## 语义契约（推荐长期依赖）

_依赖 role / aria-* / data-* / title 等语义属性 · 39 条_

| 选择器 | 使用处 | 使用者 |
| --- | --- | --- |
| `[aria-label="仅删除今天"]` | 1 | `components/TaskCard.test.tsx` |
| `[aria-label="确认仅删除今天"]` | 1 | `components/TaskCard.test.tsx` |
| `[aria-live]` | 1 | `components/FocusCharts.test.tsx` |
| `[data-modal-cancel]` | 1 | `components/dialog-actions.test.tsx` |
| `[data-overlay]` | 1 | `hooks/useMotionPresence.test.tsx` |
| `[data-side="prefix"]` | 1 | `ui/field.test.tsx` |
| `[data-side="suffix"]` | 1 | `ui/field.test.tsx` |
| `[data-slot="dialog-overlay"]` | 1 | `ui/dialog.test.tsx` |
| `[data-slot="icon-button"]` | 2 | `components/dialog-actions.test.tsx`<br>`ui/dialog.test.tsx` |
| `[data-slot="profile-view"]` | 1 | `app-views.a11y.test.tsx` |
| `[data-slot="settings-trigger"]` | 1 | `app-views.a11y.test.tsx` |
| `[data-slot="toast"]` | 2 | `components/dialog-actions.test.tsx`<br>`ui/toast.test.tsx` |
| `[data-slot="toaster"]` | 1 | `ui/toast.test.tsx` |
| `[data-task-id]` | 2 | `components/CompletedTaskCard.test.tsx`<br>`components/TaskCard.test.tsx` |
| `[data-testid="first-input"]` | 1 | `hooks/useModalBehavior.test.tsx` |
| `[data-testid="last-button"]` | 1 | `hooks/useModalBehavior.test.tsx` |
| `[data-testid="trigger"]` | 1 | `hooks/useModalBehavior.test.tsx` |
| `[data-trigger]` | 1 | `hooks/useMotionPresence.test.tsx` |
| `[inert]` | 2 | `components/DeleteButton.test.tsx`<br>`hooks/useModalBehavior.test.tsx` |
| `[inert], fieldset` | 1 | `components/StorageBoundary.android.test.tsx` |
| `[role="alert"]` | 2 | `components/DeleteButton.test.tsx`<br>`components/PomodoroTimer.test.tsx` |
| `[role="alertdialog"]` | 1 | `components/dialog-actions.test.tsx` |
| `[role="alertdialog"], [role="dialog"]` | 1 | `ui/dialog.test.tsx` |
| `[role="dialog"]` | 3 | `app-views.a11y.test.tsx`<br>`hooks/useModalBehavior.test.tsx`<br>`ui/dialog.test.tsx` |
| `[role="dialog"] button` | 1 | `packaged-ui.test.ts` |
| `[role="img"]` | 1 | `components/ManualTaskModal.test.tsx` |
| `[role="navigation"] button` | 1 | `app-views.a11y.test.tsx` |
| `[role="radio"]` | 1 | `components/ManualTaskModal.test.tsx` |
| `[role="radiogroup"]` | 1 | `components/ManualTaskModal.test.tsx` |
| `[role="switch"]` | 1 | `ui/field.test.tsx` |
| `[role=button]` | 1 | `components/StorageBoundary.test.tsx` |
| `[title="提前完成"]` | 1 | `components/PomodoroTimer.test.tsx` |
| `button[title="编辑习惯"]` | 1 | `components/DurationInputs.test.tsx` |
| `button[title="移出时间线"]` | 1 | `components/CompletedTaskCard.test.tsx` |
| `input[type="date"]` | 1 | `components/DesktopFocusStats.test.tsx` |
| `input[type="file"]` | 1 | `components/HabitConfig.test.tsx` |
| `input[type="text"]` | 1 | `components/DurationInputs.test.tsx` |
| `input[type=file]` | 1 | `components/StorageBoundary.test.tsx` |
| `section[aria-label="Data save status"]` | 1 | `components/StorageBoundary.android.test.tsx` |

## 标签契约（最稳，也最粗）

_只依赖标签名 · 13 条_

| 选择器 | 使用处 | 使用者 |
| --- | --- | --- |
| `a` | 1 | `ui/button.test.tsx` |
| `button` | 13 | `app-views.a11y.test.tsx`<br>`components/CompletedTaskCard.test.tsx`<br>`components/DesktopFocusStats.test.tsx`<br>…另 10 个 |
| `dt` | 1 | `components/DesktopFocusStats.test.tsx` |
| `fieldset` | 2 | `components/StorageBoundary.android.test.tsx`<br>`components/StorageBoundary.test.tsx` |
| `form` | 1 | `components/DurationInputs.test.tsx` |
| `h2` | 1 | `ui/dialog.test.tsx` |
| `input` | 2 | `hooks/useMotionPresence.test.tsx`<br>`ui/field.test.tsx` |
| `label` | 1 | `ui/field.test.tsx` |
| `summary` | 1 | `components/DesktopFocusStats.test.tsx` |
| `svg` | 2 | `components/CompletedFocusDistribution.test.tsx`<br>`ui/button.test.tsx` |
| `td` | 1 | `components/DesktopFocusStats.test.tsx` |
| `textarea` | 1 | `ui/field.test.tsx` |
| `ul` | 1 | `components/CompletedFocusDistribution.test.tsx` |

## 文案契约（改文案就断）

| 文案 | 使用者 |
| --- | --- |
| <1 min | `components/CompletedFocusDistribution.test.tsx` |
| 09:07 | `components/TaskCard.test.tsx` |
| 1 / 2 | `components/DesktopFocusStats.test.tsx` |
| 100.0% | `components/CompletedFocusDistribution.test.tsx` |
| 2 / 2 | `components/DesktopFocusStats.test.tsx` |
| 2026-10-05 – 2026-10-11 | `components/CompletedFocusDistribution.test.tsx` |
| 2026-10-06 | `components/FocusCharts.test.tsx` |
| 2026-10-09 | `components/CompletedFocusDistribution.test.tsx` |
| 30 | `components/FocusCharts.test.tsx` |
| 撤销 | `ui/toast.test.tsx` |
| 计时器启动失败，请重试。 | `components/PomodoroTimer.test.tsx` |
| 继续 | `components/PomodoroTimer.test.tsx` |
| 结束后播放提示 | `ui/field.test.tsx` |
| 开始休息 | `components/PomodoroTimer.test.tsx` |
| 临时任务 | `ui/dialog.test.tsx` |
| 每周目标 | `app-views.a11y.test.tsx` |
| 名称重复 | `ui/field.test.tsx` |
| 任务 B | `ui/toast.test.tsx` |
| 删除未完成 | `components/DeleteButton.test.tsx` |
| 输入任务名、目标或备注试试 | `components/CommandPalette.test.tsx` |
| 未能创建当前数据备份，已停止恢复。 | `components/HabitConfig.test.tsx` |
| 小时 | `ui/field.test.tsx` |
| 已保存 | `components/dialog-actions.test.tsx` |
| 已删除 | `components/DeleteButton.test.tsx` |
| 暂停 | `components/PomodoroTimer.test.tsx` |
| 暂无已完成任务的实际计时 | `components/CompletedFocusDistribution.test.tsx` |
| 正在保存 | `components/PomodoroTimer.test.tsx` |
| 正在启动 | `components/PomodoroTimer.test.tsx` |
| 正在删除 | `components/DeleteButton.test.tsx` |
| 重试保存 | `components/PomodoroTimer.test.tsx` |
| 最多 60 字 | `ui/field.test.tsx` |
| Measured focus time | `components/StorageBoundary.android.test.tsx` |
| No task records in this period | `components/DesktopFocusStats.test.tsx` |
| pending | `components/StorageBoundary.android.test.tsx` |
| Period review | `components/StorageBoundary.android.test.tsx` |
| Reason: Native data changed; reload before retrying | `components/StorageBoundary.android.test.tsx` |
| Retried task | `components/StorageBoundary.test.tsx` |
| Rolled back task | `components/StorageBoundary.test.tsx` |
| writes are blocked | `components/StorageBoundary.test.tsx` |

## 怎么用

1. **要动 `structural` 里的结构**：先跑 `npm run contract:dom:check` 确认清单是干净的，改完再跑一次，把 diff 和代码改动放在同一个 commit 里。
2. **新增测试**：优先用 `attribute` 级选择器（`[data-slot]`、`[role]`、`aria-*`），不要用 `.class` 或 `div > div:last-child`。
3. **`class` 和 `structural` 两级的数量只应下降**。上升说明新代码在加深耦合。
4. **`失效契约` 段落必须为空**。不为空说明有测试在断言不存在的东西。
