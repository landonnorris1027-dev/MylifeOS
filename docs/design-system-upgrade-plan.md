# 组件与设计系统改进清单

> 依据：shadcn/ui、Radix Primitives、Origin UI、Headless UI 四站的设计机制 + 本项目源码审计。
> 审计日期：2026-10-28。**本文档只是计划，未改动任何代码。**
> 落地分支：`codex/ui-polish`（基线 `29bb4a1`），不直接动 main。

---

## 0. 结论先说

本项目的**交互行为**质量高于**组件体系**质量：`useModalBehavior` 已经实现了焦点陷阱、inert 背景隔离、滚动锁、嵌套弹窗栈、顶层判定——这些是很多成熟库都没做全的。真正的问题不在"缺 Radix"，而在**没有共用的构件层**：

- **5 套视觉语言并存**：`ui-motion.css`（Google 风：#0b57d0 主色 / 999px 胶囊 / 24px 面板）、裸 Tailwind（Notion 风：`bg-gray-50` + `bg-gray-900` 当主色 + `focus:ring-gray-200`）、`profile.css`（25px 圆角卡片）、`TaskCard.css`、`rare-ui.css`。
- **0 个语义 token 配对**：`index.css` 只有 4 个优先级色；`ui-motion.css` 的 15 个局部变量之外，散落 `#0842a0` `#e8eaed` `#a8c7fa` `#e8f0fe` `#f1f3f4` `#e7ecf3` 等手工派生色。
- **25 处手写输入框 / 4 处原生 `<select>` / 6 处原生 checkbox**，3 套输入外观（`p-2` / `p-2.5` / `px-3 py-2`；`bg-white` vs `bg-gray-50`；`ring-gray-200` vs 全局 outline），且**没有一处做 label↔描述↔错误的 ARIA 串联**。
- **8 个 dialog 调用点**各自复制 overlay 结构、进场类、关闭按钮、标题层级。

路线：**先地基（token + 原语），再换皮（页面），最后才谈暗色/密度**。顺序反了会把 5 套语言变成 6 套。

---

## 1. 现状审计（可核对）

| 维度 | 现状 | 证据 | 影响 |
|---|---|---|---|
| 色彩 | 4 个优先级 token，其余全硬编码 | `src/index.css:6-11`；`ui-motion.css:3-16` | 换主色要改 30+ 处；暗色无从下手 |
| 圆角 | 12 种取值：4/6/11/12/14/16/18/24/26/28/99/999px | `grep border-radius src/*.css` | 同类容器圆角不一致（弹窗 16px vs 面板 24px vs 卡片 25px）|
| 抬升 | `shadow-xl` / `shadow-2xl` / 两次几乎不可见的手写阴影 | `ui-motion.css:79` | 层级感靠感觉，不靠阶梯 |
| 层级 | z-index 1/30/35/40/50/100 散落 | `grep z-index src/*.css` | 新增浮层靠试 |
| 字体 | `system-ui` 与 `"Segoe UI","Microsoft YaHei UI"` 两套 | `tailwind.config.js:10` vs `ui-motion.css:18` | Win/mac 字重与行高观感不一致 |
| 表单 | 25 处裸 `rounded-lg border`；无 Field 家族 | `grep -rn "rounded-lg border" src --include=*.tsx` | 无 `aria-describedby`/`aria-invalid`，错误只靠视觉 |
| 按钮 | 5 种写法：`motion-button`+`motion-primary`、`rounded-lg border`、`bg-gray-900`、`rounded-full`、`px-2 py-1` | 全项目 | 调用方必须知道两三个类名才能拼出一个按钮 |
| 组合工具 | 无 `clsx` / `tailwind-merge` | `package.json` | 176 处 `motion-*` 字符串直接写在 JSX，覆盖顺序不可控 |
| 目录 | `src/components/` 平铺 37 个 tsx，业务与 UI 混放 | 目录结构 | 找不到"这个按钮到底有几个版本" |
| 导航语义 | 主导航用 `aria-pressed` 按钮组，非 tablist | `App.tsx:269`；`SegmentedControl.tsx:18` | 读屏不播报"第 2 个标签，共 4 个" |
| 提示 | undo 条（`bg-gray-900` 固定 z-40）与 `.motion-success-toast` 两套 | `App.tsx:561`；`AlertModal.tsx:34` | 无队列、无超时、无关闭、同时出现会叠 |
| 暗色 | `dark:` 仅 1 处，无 `.dark` 令牌块 | `grep "dark:" src` | 桌面应用 + 用户系统暗色，属真实缺口 |
| 无障碍资产 | 已有的比想象多：`role=status`、`aria-live`、`:focus-visible`、`prefers-reduced-motion`、触屏 48px | `index.css:30-61` | 应该保留并统一，而不是重写 |
| 测试 | 43 文件 / 296 测试 + `design-qa.md` 像素级验收 | `design-qa.md` | 任何重构必须先立视觉基线，否则会静默破约 |

---

## 2. 四站可迁移的机制（学什么 / 不学什么）

### shadcn/ui —— 学「token 契约」和「Field 解剖」，不引 CLI
- **语义配对命名**：`primary` / `primary-foreground`、`muted` / `muted-foreground`、`border`、`input`、`ring`。本项目现在只有"颜色"，没有"颜色 + 它上面该用什么前景色"，这正是 `#a8c7fa` 这类手工浅色出现的原因。
- **单一 `--radius` 派生阶梯**（`sm=0.6×` … `2xl=1.8×`）：把 12 种圆角收敛成 5 档，改一处全站变。
- **`Field` 解剖**：`FieldSet > FieldLegend > FieldGroup > Field(FieldLabel + Control + FieldDescription + FieldError)`，`data-invalid` 驱动整块错误态，`aria-invalid` + `aria-describedby` 自动串联。这是本项目**收益最大**的单条。
- **不学**：不跑 `shadcn@latest init`。它会带入 Tailwind 4 的 `@theme inline` + oklch 全量令牌，与现有 Tailwind 3.4 配置、25px 圆角、像素级验收直接冲突。**只抄结构，不抄产物。**

### Radix Primitives —— 只补「手写成本高」的 7 个原语
- 值得引：`Tooltip`、`Popover`（锚定 + 碰撞翻转）、`Select`、`Switch`、`Checkbox`（indeterminate）、`RadioGroup`、`ScrollArea`。这些的 WAI-ARIA 细节（roving tabindex、`aria-activedescendant`、typeahead）手写一次就会错一次。
- 采纳它的**约定**：`asChild`（项目已装 `@radix-ui/react-slot`，正好复用）、`data-state=open|closed|checked`、`data-side`、`data-highlighted`、`data-disabled`。有了这套数据属性，进出场动画写一次全局 CSS 就够，不用每个组件一套类。
- **不引 `Dialog`**：自研的 `useModalBehavior` 在"背景 inert 隔离""嵌套栈只让顶层吃 Tab""Escape 本地消费"上比默认 Dialog 更贴本项目；换成 Radix 是净损失。

### Origin UI（现跳转 coss/ui，Base UI 内核）—— 学「状态矩阵」和 `InputGroup`
- 它的真正价值不是配色，而是**每个控件都有完整的状态矩阵**（default / hover / focus / invalid / disabled / readonly / with-icon / with-addon / small / large），以及 `InputGroup`（前缀图标 + 输入 + 后缀单位 + 内嵌按钮一体）和 `NumberField`（步进、长按连续、越界钳制）。
- 本项目 25 处手写输入里，至少 6 处是"图标 + 输入 + 单位"（周目标小时数、"小时"后缀、搜索框放大镜）和"分钟数微调"（`DurationPicker`、`HabitConfig`）——正好被这两个组件吃掉。
- **不引**整套 coss/ui：Base UI 内核 + Tailwind 4 风格，迁移成本大于收益。

### Headless UI —— 学「状态完备性」，不引库
- 它对每个控件的 `disabled` / `invalid` / `readonly` 都有明确视觉与语义，且用 `data-*` 驱动过渡。本项目缺的正是"控件状态清单"这件事，而不是它的代码。
- 它和 Radix 功能高度重叠，两库同时引会让包体和 API 心智双输。**只引 Radix。**

---

## 3. 改进清单

### A. 地基（必须先做，否则后面全是复制粘贴）

- [ ] **A1 `cn()` + `src/ui/` 目录** — 装 `clsx` + `tailwind-merge`（各 ~1KB），新建 `src/ui/` 放原语、`src/patterns/` 放复合块；先把现有 176 处 `motion-*` 字符串归口到常量或组件，禁止新增裸类名。
  *验收*：`src/ui/` 下每个文件只导出组件；`grep` 无新增 `className="motion-`。
- [ ] **A2 语义 token 层** `src/styles/tokens.css` — 按 shadcn 配对约定定义：`--background/--foreground`、`--card/--card-foreground`、`--popover`、`--primary/--primary-foreground`、`--secondary`、`--muted/--muted-foreground`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--success`。
  *关键约束*：命名可借，**取值必须等于现有视觉**。用 hex→oklch 转换后回读验证 ΔE < 1，并把 `--priority-p1..none` 降级为"数据色"，另派生 `--p1-soft` / `--p1-line` / `--p1-ink` 三档，消灭 `#a8c7fa` `#e8f0fe` 这类手工浅色。
  *验收*：`design-qa.md` 的原截图逐屏 diff 无可见差异（阈值沿用现有做法）。
- [ ] **A3 圆角阶梯** — `--radius: 16px`，派生 `sm/md/lg/xl/2xl` + 单独 `--radius-pill`；把 12 种取值收敛到 5 档（`profile.css` 的 25px 卡片刻意保留为 `--radius-card-profile`，因为它是像素级验收过的）。
- [ ] **A4 抬升与层级两套阶梯** — `--shadow-1..3`、`--z-base/nav/popover/modal/toast/tooltip`。
  *不动时长*：`ui-motion.css` 的 120 / 160 / 360ms 是有意分工（按压 / 颜色 / 面板），`--motion-ease` 与 `--motion-spring` 也已存在。上一轮已核实，**不做时长 token 化**，避免纯 churn。
- [ ] **A5 状态约定** — 统一 `data-state`（`open|closed|checked|unchecked|on|off|highlighted|invalid`）+ `data-slot`（供样式与测试双用）；写进 `AGENTS.md` 的编码约定。
- [ ] **A6 字体与数字** — 收敛到单一字体栈（`"Segoe UI", "Microsoft YaHei UI", system-ui`）；`font-variant-numeric: tabular-nums` 提为 `.tnum` 工具类，替掉散落的行内写法。

### B. 原语层（`src/ui/`）

- [x] **B1 `Button`** — `variant: primary | secondary | ghost | danger | info | success` × `size: sm | md | lg` × `block` / `loading` / `asChild`（走已装的 Slot）。`type` 默认 `button`，表单里必须显式 `type="submit"`，避免误提交。
- [x] **B2 `IconButton`** — 30 / 36 / 44 三档，`aria-label` 用 TS 强制必填；`variant` 支持 `ghost | secondary | danger`，`tone="inherit"` 用于彩色标题栏里跟随前景色。
  *已迁移*：`AlertModal`、`ConfirmModal`、`ManualTaskModal`、`HabitConfig`、`RecoveryModal`、`TimePickerModal`（+ `TaskSearchModal`）。
  *边界*：只迁"动作按钮"。模板卡、生效方式、重复日、时间段、休息时长这些是**选择控件**，仍是方角块，留给 C5 / SegmentedControl。
- [x] **B3 `Field` 家族** — `Field` / `FieldLabel` / `FieldDescription` / `FieldError` / `FieldGroup` / `FieldSet` / `FieldLegend` / `FieldSeparator` / `FieldTitle`；`Field` 生成 id 并用 `aria-describedby` 串联描述与错误，`data-invalid` 切整块错误态；`Input`/`Textarea`/`Select`/`NumberField`/`Switch`/`Checkbox` 从 context 继承 id，调用方不可能漏接。
  *已改造*：`TaskSearchModal`、`ManualTaskModal`、`PreferencesSettings`、`HabitConfig`（名称/目标/优先级/配额/生效区间/重复日）。
  *验收*：真实应用三处弹窗扫描，未命名控件 **0**。
- [x] **B4 `Input` / `Textarea` / `InputGroup` / `NumberField`** — 统一 `min-height: 40px`、`ring` 三态、`data-invalid`；`InputGroup` 支持前图标 / 后单位 / 多行；`NumberField` 支持步进、长按连续、输入中不打断、失焦才钳制。
  *过渡件*：`Select` / `Switch` / `Checkbox` / `CheckboxChip` 先给 CSS-only 版本（行为仍是原生），Radix 版留在 B5 / B6。
- [ ] **B5 `Select`** — Radix Select 封装（桌面）+ 原生 `<select>` fallback（Android/触屏，保留系统 picker）。替掉 4 处手写 select，含 `TaskSearchModal.tsx:49-62`。
- [ ] **B6 `Switch` / `Checkbox`（含 indeterminate）/ `RadioGroup`** — 替掉 6 处原生控件；触屏命中区沿用 `index.css:30-34` 的 48px 规则，不重复实现。
- [ ] **B7 小件**：`Badge`（吸收 `.motion-priority-tag` + `.motion-panel-count`）、`Kbd`（吸收 `.motion-shortcut`）、`Separator`、`Skeleton`、`Spinner`（吸收 `.motion-spinner`）、`Empty`（吸收 `.motion-empty`，补图标 + 主副文案 + 主操作三槽位）。
- [ ] **B8 `Tooltip`**（Radix）— 替代 `.motion-shortcut-help` 的 `<summary>` 弹层和散落的 `title` 属性；所有 icon-only 按钮补文字提示。

### C. 复合组件（`src/patterns/`）

- [x] **C1 `Dialog`** — `src/ui/dialog.tsx`：外壳拥有 overlay / 面板 / 存在感 / 焦点行为，调用方只留内容和动作。`variant: panel | notice`、`size: sm|md|lg|xl`、`layer: base|alert|critical`、`headerAction`、`closeLabel`、`bodyPadding`、`ariaLabel`/`ariaDescribedBy`。面板必须是 overlay 的直接子节点（`motion-modal-overlay` 的进场动画依赖 `> [role="dialog"]`）。
  *已迁移*：`ManualTaskModal`、`HabitConfig`、`TimePickerModal`、`RecoveryModal`、`AlertModal`、`ConfirmModal`。6 处复制的 `fixed inset-0 bg-black/20` 归零。
- [x] **C2 `AlertDialog`** — 合并 `AlertModal` + `ConfirmModal` 为一个组件：`tone: info|danger|success`、单按钮或双按钮（有 `cancelLabel` 即双按钮并自动聚焦取消，`data-modal-cancel` 契约保留）、`role="alertdialog"` + `aria-describedby` 指向正文。
  *保留*：`AlertModal` 的 `tone="success"` 仍走角落 toast，等 C3 接管。
- [x] **C3 `Toast`** — `src/ui/toast.tsx`：模块级队列 + `useSyncExternalStore`，任何地方 `toast({...})` 即可；堆叠上限 3、默认 5s、hover/focus 暂停、可关闭、`duration: 0` 常驻、同 id 替换不叠加；动作按钮 + 副文案；`role=status`/polite，`assertive` 时升为 `role=alert`。
  *合并*：`App.tsx` 的 undo 条（改为镜像 `undoTask`，10s 窗口仍由控制器拥有）与 `AlertModal` 的 success 分支（改为投递 toast 并自动关闭，不再渲染卡片）。
- [x] **C7 `Command`（⌘K）** — `src/components/CommandPalette.tsx` 取代 `TaskSearchModal`：输入即搜、`role=listbox` + `aria-activedescendant`、↑↓ 循环、Enter 执行、Esc/点击遮罩关闭、任务按日期倒序、结果分组（任务 / 快捷动作）、底部快捷键提示；原 5 个筛选器收进「高级筛选」二级面板。
  *偏差*：没有单独的"目标"分组——本项目没有按目标跳转的落点，列出来点了没反应，只保留可执行的两组。
- [ ] **C4 `Popover`**（Radix）— 日期快捷、筛选、任务溢出菜单统一用它，替掉写死 `absolute` 定位的弹层（碰撞翻转 + 焦点归还由 Radix 保证）。
- [ ] **C5 导航语义** — 主导航从 `aria-pressed` 按钮组改为 `role=tablist` + `aria-selected` + roving tabindex（左右方向键切换）；移动端 `mobilePane` 同理。`SegmentedControl` 保留为**表单型**分段控件（如 timelineMode），两件事分开。
- [ ] **C6 `Sheet`** — 移动端任务详情/编辑从居中弹窗改为底部抽屉（配合已有 `.motion-mobile-panes`），落进拇指区；桌面仍用 Dialog。
- [ ] **C8 统计表语义** — 折叠的 details 里已有表格化数据，补 `<table>`/`<th scope>` 或 `role=table`，让读屏能按行列播报。

### D. 页面级深化

- [ ] **D1 设置页重排** — 现在用 `<label>` 当区块标题（无 `for`，语义错误）。改为 `FieldSet` + `FieldLegend` + `FieldGroup` + 右侧 `Switch` 行；左侧锚点导航改 sticky Tabs 并做滚动联动。
- [ ] **D2 任务卡** — hover-only 的操作改为"主操作常显 + 溢出菜单（Popover）"；优先级标签换 `Badge`；键盘与触屏都能到达全部操作。
- [ ] **D3 空/载状态** — 列表首载用 `Skeleton`（现在是 spinner）；`Empty` 统一文案层级与主操作。
- [ ] **D4 焦点环统一** — 全局 `:focus-visible` 用 `--ring`，替掉 `index.css:46` 的 `#37352F`，让 `.motion-ui` 内外一致。
- [ ] **D5 密度模式** — `data-density="comfortable|compact"` 驱动 token 覆盖（行高、内边距、卡片间距），桌面端一屏多看 2–3 条任务。
- [ ] **D6 暗色模式** — `.dark` 覆盖同一套语义 token；`--priority-p1..none` 在暗底上重新取值并**实测 WCAG AA ≥ 4.5**（紫色 #9d7bf5 在深底上需提亮/降饱和）；Electron 跟系统 + 手动三态。**放在最后**，因为它需要 A2 完成才可能只改一个文件。

### E. 质量门（贯穿全程，不是最后做）

- [ ] **E1 视觉基线先行** — 动手前先把 planner / profile / settings / 3 个弹窗 / 375px 与 1280px 两档截图入库，重构后逐屏 diff，结论写回 `design-qa.md`（沿用现有证据格式）。
- [ ] **E2 DOM 契约清单** — 列出 296 个测试依赖的 `aria-label` / `data-testid` / 可见文案，重构前后跑 `npm run verify:quality`；契约变更必须单独提交。
- [ ] **E3 a11y 门禁** — 加 `eslint-plugin-jsx-a11y` + 一个 axe 冒烟测试（3 个主视图 + 2 个弹窗），进 CI。
- [ ] **E4 原语预览页** — 不引 Storybook（体积/维护成本不划算），改为 `src/ui/__preview__/` 一个内部路由，按 Origin UI 的方式展示每个原语的状态矩阵；改 token 时一屏就能看出破没破。
  *已完成雏形*：`ui-preview.html` + `src/ui/preview.tsx`（`?only=<section>` 可单独看一屏；不进入生产构建）。

---

## 7. 实施记录

### 2026-10-28 · B3 + B4 落地（commit 待提交）

新增 `src/ui/`：`cn.ts`、`field.tsx`、`input.tsx`、`number-field.tsx`、`choice.tsx`、`ui.css`、`index.ts`、`preview.tsx`、`field.test.tsx`；依赖 `clsx` + `tailwind-merge`。改造 4 个调用点。

与计划的偏差（读代码后判断）：

| 计划项 | 实际做法 | 原因 |
|---|---|---|
| `DurationPicker` 换成 `NumberField` | **保留原组件**，只外包 `Field` 提供标签 | 它是带 MIT 归属与形变动画的专用组件（`rare-ui.css`），替换等于毁掉既有设计与授权声明 |
| `Select` 留到 B5 | 先给 CSS-only 原生封装 | 否则同一张筛选表里新旧控件并排，比不改更差 |
| `Switch`/`Checkbox` 留到 B6 | 先给 CSS-only 原生封装（`role="switch"`） | 同上；Radix 版仍然值得做（indeterminate / 触屏命中区） |

浏览器实测发现并修掉的问题：

1. `Switch`/`Checkbox` 没有读 `FieldContext` → `label[for]` 指向不存在的 id，读屏三个开关全部无名。已修，并补测试锁住。
2. 步进按钮在浅底上几乎不可见 → 补 1px 描边与 hover 态。
3. 设置卡片里输入框与卡片同为 `#f9fafb` → 加 `tone="card"` 让控件翻白。
4. 备注框带 resize 手柄，在固定高度弹窗里会顶出底部按钮 → 改为 `resize: none`。

验证：`typecheck` 通过；312 测试通过（新增 5 条原语测试）；生产构建通过；真实应用（Chromium 1280×940）三处弹窗扫描未命名控件 0 个，搜索按钮与下拉框实测同为 40px 高。

证据：`docs/ui-forms/primitives.png`（原语矩阵）、`settings.png`、`search.png`、`manual.png`。

### 2026-10-28 · B1 + B2 落地（弹窗域按钮）

新增 `src/ui/button.tsx`（`Button` / `IconButton`）+ 6 个变体样式 + 5 条测试（`button.test.tsx`）、3 条弹窗契约测试（`dialog-actions.test.tsx`）。迁移 7 个弹窗的动作按钮。

设计决定：

| 决定 | 理由 |
|---|---|
| 动作按钮统一为胶囊形 | 应用里 `.motion-button` 一直是胶囊（顶栏 CTA、分段控件、搜索提交）；弹窗里的圆角矩形才是异类 |
| 选择控件保持方角 | 休息时长、重复日、生效方式、时间段是"选项"不是"动作"；混成胶囊会让可点区域变得模糊。C5 会把它们统一成 SegmentedControl / ToggleGroup |
| `type` 默认 `button` | 原来 `<button>` 在 form 里默认 submit，靠人工记得加 `type`；现在改成动作必须显式声明提交 |
| 保留 `title` | 迁移时丢了 `title`，`DurationInputs.test.tsx` 立刻用 `button[title="编辑习惯"]` 抓到了——DOM 契约清单（E2）的价值现场演示 |
| `tone="inherit"` | 时间选择弹窗的标题栏按优先级染色，图标按钮必须跟随前景色而不是强制灰色 |

浏览器实测抓到并修掉的问题：

1. `asChild` 分支把 `null` 和子元素一起交给 Slot → Slot 要求唯一子元素，直接抛错。改为分支渲染。
2. 加载态继承了 `disabled` 的 `opacity: .45`，主按钮看起来像"被禁用"而不是"在忙"。`aria-busy` 单独提到 0.75。
3. `IconButton` 默认无底色，在预览里三档尺寸看不出差别 → 补 `secondary` 常显变体（工具栏场景也需要）。

验证：typecheck 通过；320 测试通过（连跑两遍稳定）；生产构建通过；三处弹窗审计未命名控件 0、未命名按钮 0。

证据：`docs/ui-forms/buttons.png`（变体 / 尺寸 / 加载 / 图标按钮 / 弹窗动作区复刻）。

### 2026-10-28 · C1 + C2 落地（弹窗外壳归一）

新增 `src/ui/dialog.tsx`（`Dialog` / `DialogFooter`）、`src/ui/alert-dialog.tsx`（`AlertDialog`）+ 6 条外壳测试。迁移 6 个弹窗，删除 6 份重复 overlay。

设计决定：

| 决定 | 理由 |
|---|---|
| 面板必须是 overlay 的直接子节点 | `ui-motion.css` 的进出场动画写的是 `> :is([role="dialog"],[role="alertdialog"])`，加一层 wrapper 会静默丢掉动画 |
| 头部固定、正文滚动 | 原 `HabitConfig` 是整块 `max-h-[90vh] overflow-y-auto`，标题会跟着滚走；改成 header 固定 + body `overflow-y:auto` 后长表单体验更好 |
| `role` 由调用方声明 | 确认类必须是 `alertdialog`；默认 `dialog` |
| 标题自动 `aria-labelledby` | 原来 `HabitConfig` / `TimePickerModal` 的面板**没有可访问名称**，只有视觉 h2 |
| `CloseTone` / `headerAction` | 时间选择弹窗的标题栏按优先级染色，关闭按钮必须跟随前景色；习惯配置的关闭要先重置表单，不能被默认按钮接管 |

浏览器实测（Chromium 1280×940，CDP 驱动真实交互）：

1. 设置弹窗：面板 908px = 视口 940 − 32，正文 `client 847 / scroll 1051`，标题栏固定、正文独立滚动 ✓
2. 新增任务：创建「排期验证任务」→ 回到列表点击卡片 → 时间选择弹窗打开，标题栏按优先级染色、关闭按钮跟随前景色 ✓（这条同时验证了建任务全链路）
3. 确认弹窗叠在设置弹窗之上：`alert(100) > base(50)`，两个按钮等宽，`role=alertdialog` ✓
4. 三处审计：未命名控件 0、未命名按钮 0

验证：typecheck 通过；326 测试通过；生产构建通过。

证据：`docs/ui-forms/dlg-settings.png`、`dlg-manual.png`、`dlg-confirm.png`、`dlg-timepicker.png`。

### 2026-10-28 · C3 + C7 落地（提示队列 + 命令面板）

新增 `src/ui/toast.tsx`（队列 + `Toaster`）、`src/components/CommandPalette.tsx`；删除 `TaskSearchModal.tsx`（-86 行）；`Dialog` 增加"点击遮罩关闭"（`dialog` 默认开、`alertdialog` 默认关）。

设计决定：

| 决定 | 理由 |
|---|---|
| toast 用模块级 store 而不是 Provider | 任何层（含控制器）都能直接 `toast()`，不必在 index.tsx 里加一层 Provider，测试也只需 `clearToasts()` |
| undo 的 10s 窗口仍由控制器拥有 | toast 只做镜像（`duration: 0`），避免两处计时器互相打架 |
| `AlertModal` 的 success 分支改为投递 toast 并自关 | 成功提示不该挡住操作；调用方 API 不变 |
| 命令面板复用 `Dialog` | 存在感、焦点陷阱、Esc、层级都是现成的，省掉第三套弹窗实现 |
| 不列"目标"分组 | 没有按目标跳转的落点，列出来点了没反应 |
| 点击遮罩关闭默认按 role 区分 | 确认类弹窗误触关闭代价高，普通弹窗应当能点外面关掉 |

浏览器实测：

1. 命令面板：`搜索任务` 打开，面板 322px；任务按日期倒序 + 快捷动作两组；列表 `role=listbox`，活动项 `aria-selected=true` 且有底色；未命名控件 0。
2. 提示条：连发 4 条只留 3 条（"第一条"被挤掉）；undo 条常驻、带"撤销删除"动作与关闭按钮。
3. 真实链路：设置 → 导出备份 → 确认，底部出现「备份已保存到：mylifeos_backup_2026-10-28.json」的绿色成功提示——这是 `AlertModal` success → toast 的端到端验证。

验证：typecheck 通过；**337 测试通过**（新增 6 条 toast 队列测试 + 5 条命令面板测试）；生产构建通过。

证据：`docs/ui-forms/command.png`、`toast.png`、`toast-undo.png`、`toast-app.png`。

---

## 4. 优先级与批次

| 批次 | 内容 | 优先级 | 改动面 | 依赖 |
|---|---|---|---|---|
| 0 | A1–A6 地基 + E1 基线 | **P0** | 新增 4 个文件，改 5 个 css | 无 |
| 1 | B1–B6 核心原语 + E2 | **P0** | 新增 ~14 文件，改 12 个组件 | 批次 0 |
| 2 | C1 Dialog + C2 AlertDialog + C3 Toast | **P0** | 改 8 个弹窗调用点 | 批次 1 |
| 3 | C5 导航语义 + C7 命令面板 + D1 设置页 + D2 任务卡 + D4 | P1 | 改 App / 设置 / 任务卡 | 批次 2 |
| 4 | B7–B8 小件 + C4 Popover + C6 Sheet + D3 | P1 | 新增 ~8 文件 | 批次 1 |
| 5 | D5 密度 + D6 暗色 + C8 + E3/E4 | P2 | 全站 token 级 | 批次 0–4 |

**建议先做的一条**：如果只能做一件事，做 **B3 + B4**（Field 家族 + Input 家族）。它一次性解决 25 处输入的外观分裂和全部表单无障碍缺口，改动可量化、风险低、不碰像素级验收过的图表与卡片。

---

## 5. 明确排除（避免走弯路）

| 不做什么 | 原因 |
|---|---|
| 跑 `shadcn init` / 迁 Tailwind 4 | 会带入 `@theme inline` + oklch 全量令牌，与 Tailwind 3.4、25px 圆角、像素级验收冲突 |
| 把 Dialog 换成 Radix Dialog | 自研的 inert 隔离 + 嵌套栈 + 顶层 Tab 判定更强，换是净损失 |
| 引入 Headless UI | 与 Radix 重叠，双库 = 包体 + 心智双输 |
| 整套引入 coss/ui（原 Origin UI） | Base UI 内核 + 新 token 体系，迁移成本 > 收益，只借 `InputGroup`/`NumberField`/状态矩阵的思路 |
| 全站换 oklch 色值 | 除非 ΔE < 1 验证通过，否则会静默改掉已验收的观感 |
| 引 Storybook | 一个内部预览路由足够，不值得多一套构建 |
| 重做动效时长体系 | 现有 120/160/360ms 与两条缓动曲线是有意分工，改它只有回归风险 |

---

## 6. 风险与回滚

- **像素级回归**：`design-qa.md` 里的 375×344.375 趋势卡、25px 圆角、四个优先级色都是验收过的硬指标。A2/A3 若触碰这些值，必须单独出一份 diff 证据。
- **测试破约**：`packaged-ui.test.ts` 断言了 `Period review`、Day/Week 切换等文案与结构，改动前先读测试。
- **回滚粒度**：每个批次一个分支、一次提交；token 层改动必须能靠"只回滚 tokens.css"复原观感。
