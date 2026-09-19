# MyLifeOS 桌面版（Electron Windows）改进路线图

> 本地优先的 React 18 + TypeScript 生产力应用，三端共享渲染层：Electron（Windows 桌面）、Capacitor（Android）、浏览器降级。
> 本文聚焦**桌面端**的优化，可直接按 Phase 逐步执行。配套结构化文件见 `improvement-roadmap.json`。

## 架构概览

```
┌─ Renderer (React 18 + TS, CRA) ──────────────────────────────┐
│  App.tsx → useAppController (reducer 统一状态)                │
│  components/ (UI)   services/ (storage/scheduling/electronIPC)│
└───────────────┬──────────────────────────────┬───────────────┘
                │ preload.js (channel 白名单)   │ Capacitor (Android 另一壳)
┌───────────────▼──────────────────────────────┘
│  Electron 主进程 (electron.js)
│  ├ 窗口管理 (1200×800, 单实例, contextIsolation, GPU 禁用)
│  ├ 番茄钟运行时 (主进程持有, 持久化到 pomodoro-state.json)
│  └ 存储 IPC (storage-get/set-sync → userData/app-data.json)
```

**核心设计优点（保留）**：local-first 无网络依赖；计时器由主进程持有实现防漂移；离线过期会话恢复（`pomodoro-state.json` + `pendingRecoveries`）；preload 白名单安全模型（`contextIsolation: true`、`nodeIntegration: false`）。

## 现状关键数据

| 项目 | 现状 |
|---|---|
| Electron | 44.4.2（Phase 2.4 已完成，Windows 仅构建 x64） |
| 单次任务更新 | ≈ 6 次整文件读 + 2 次整文件写（同步 `sendSync` 阻塞渲染进程） |
| `app-data.json` 体积 | 数据集的 ~8 倍（最多 7 个恢复点各嵌入完整 JSON 备份） |
| 打包 | `asar: false` + `extraResources` 重复复制 `build/`（**Phase 2 已修复**） |
| `src/` 键盘事件处理 | 0 处（所有弹窗无 Escape、无 focus trap） |
| 主进程类型保护 | 无（纯 JS，仅 `node -c` 语法检查） |
| 组件测试覆盖 | 11 个组件中 10 个零覆盖 |

## 依赖关系与执行顺序

```
Phase 2 (打包配置)  ─────────────零风险，可立即执行
      │
Phase 0 (TS 迁移)   ──必须先于──▶  Phase 1 (存储性能)   ← 主进程改动大，先有类型保护
      │                                 │
      └──────────────必须先于──▶  Phase 4 (原生能力)   ← 托盘/对话框/窗口状态都在主进程

Phase 3 (键盘可用性)  ────────────与主进程无关，可并行（纯 renderer）
```

**建议执行顺序**：Phase 2 → Phase 0 → Phase 1 → Phase 3 → Phase 4。每个 Phase 作为一个独立提交，各自跑通 `npm run verify:release` 后再进入下一个。

---

## Phase 0 — 主进程 TypeScript 迁移（blocker，后续阶段前置）

**目标**：`electron.js`、`preload.js`、`electron-timer-restore.js`、`electron-window-target.js` 迁移到 TS，获得类型保护。

**步骤**：
1. 新建 `tsconfig.main.json`（`module: commonjs`、`target: es2018`、`outDir: ./dist-main`、`rootDir: ./src/main`、`strict: true`）
2. 主进程源码移入 `src/main/`（`electron.ts`、`preload.ts`、`electron-timer-restore.ts`、`electron-window-target.ts`）；renderer 侧 `src/electron.d.ts` 的类型定义与主进程共享，消除重复声明
3. 迁移 `src/electron-timer-restore.test.js`、`src/electron-window-target.test.js` 为 `.test.ts`
4. `package.json`：`main` 指向编译产物 `dist-main/electron.js`；新增 `build:main`（`tsc -p tsconfig.main.json`）；`electron:dev`/`electron:build`/`prod` 前置依赖 `build:main`；`check:electron` 改为 `tsc --noEmit -p tsconfig.main.json`（替代 `node -c`）
5. `electron-builder` 的 `files` 加入 `dist-main/**/*`，移除旧的根目录 JS 条目

**风险**：
- `electron.js` 顶部 `require('./electron-timer-restore')` 等相对引用需随目录调整
- `.gitignore` 已忽略 `dist/`，需补 `dist-main/`
- `preload.js` 的 `contextBridge` 类型需与 `src/electron.d.ts` 的 `ElectronAPI` 接口对齐

**验证**：`npm run verify:release` 全绿 + `npm run electron:dev` 窗口正常加载 + 计时器/恢复流程正常。

---

## Phase 1 — 存储性能（P0，收益最大）

> **进度：1.1 + 1.2 已于 2026-09-19 完成并实测通过（提交 `e81f286`）；1.3（异步化）按原计划留作后续，Phase 1 关闭。**

**核心洞察**：渲染进程 API 可以完全不动（保持 `sendSync` 的同步语义），只让**主进程变快**——把 O(整文件 I/O) 降为 O(内存 Map 操作)。

### 1.1 主进程内存缓存 + 批量延迟写 ✅ 已完成

改造 `electron.js` 的 `registerStorageIpc`（现为 `:393-428`）：

- 启动时一次性加载 `app-data.json` 到 `Map<string, string>`（复用 `readAppDataStore` 逻辑）
- `storage-get-sync`：直接 `cache.get(key)` 返回，**零文件读**
- `storage-set-sync`：`cache.set(key, value)` 立即返回，写操作进入**防抖队列**（如 300ms 窗口内合并，一次 `writeFileSync` 落盘整个 store）
- `app.on('before-quit')`：**同步强制 flush**，防止退出丢数据
- 写失败保留旧缓存值并返回 `{ok:false}`（渲染进程已有 `StorageWriteError` 处理路径）

**效果**：单次任务更新从 ~6 读 + 2 写 → 6 次内存读 + 1 次延迟写，UI 冻结消除。

### 1.2 恢复点移出热存储路径 ✅ 已完成

当前 `createAutomaticRecoveryPoint` 从 `storage.ts` 的 8 个写操作处触发，每次做 3 次整文件读 + 全量导出 + 排序 + 写入。

- 恢复点数据移到**独立文件** `userData/recovery-points.json`（主进程持有，不进 `app-data.json`）
- 创建策略改为：每日首次变更时创建（保留去重）+ `pre-import`/`pre-restore` 强制创建；**不再每次变更都触发**
- 修复 `recoveryPointService.ts:18` 的 `formatLocalDate` 与 `dateUtils.formatDateLocal` 重复（直接复用）
- 修复去重的时区错配 bug（`createdAt` 是 UTC `toISOString`，却与本地日期 `slice(0,10)` 比较 → 非午夜零时区用户可能跳过或重复）

**效果**：热文件体积回归数据集本身体积（约 1/8），恢复点开销不再进入每次按键级操作。

### 1.3（可选，低优先）异步化

将 `storage-set-sync` 升级为异步 `invoke('storage-set')`，`localStorageStore.ts` 的 `setStorageItem` 变为 async。需要整个 storage 层（`saveDailyLog` 等）改为返回 Promise，牵涉面广——**建议 Phase 1 先用 1.1+1.2 拿到 90% 收益**，异步化留作后续。

**验证**：新增主进程缓存单元测试（mock fs）；手动测试连续快速拖拽 10 个任务到时间轴确认无卡顿；`npm run verify:release`。

### Phase 1 执行记录（2026-09-19，分支 `codex/windows-desktop`，提交 `e81f286`）

- 新增 `src/main/app-data-store.ts`（`AppDataStore`：内存 `Map` 缓存 + 300ms 防抖批量落盘 + `before-quit` 同步 flush + 写失败回滚到磁盘状态）与 `src/app-data-store.test.ts`（6 个用例：单次加载、防抖合并、flush 取消定时器、删除键、写失败回滚、损坏文件恢复）。
- `src/main/electron.ts`：`storage-get-sync`/`storage-set-sync` 全部改走缓存（读零磁盘 I/O）；`app.on('before-quit')` 强制 flush。
- 恢复点键 `mylifeos_recovery_points` 在主进程重定向到独立存储 `userData/recovery-points.json`（同样内存缓存）；启动时自动把存量恢复点从 `app-data.json` 迁出并删除热键。浏览器分支行为不变（仍走 localStorage）。
- `recoveryPointService.ts`：删除本地 `formatLocalDate` 副本，复用 `dateUtils.formatDateLocal`；auto-daily 去重改为按本地日历日比较（修复 UTC `createdAt.slice(0,10)` 与本地日期比较的时区错配）。

实测证据：

- `npm run verify:release` 全绿：9 个测试套件 / 60 个测试通过（含 6 个新缓存用例）、CRA 构建成功、主进程 `tsc --noEmit` + `tsc -p tsconfig.main.json` 通过。
- 真实数据目录冒烟（`%APPDATA%/MyLifeOS`）：启动后 `recovery-points.json` 新建并含全部 7 个历史恢复点；`app-data.json` 中 `mylifeos_recovery_points` 键被移除，仅余 6 个热键（habits/goals/daily_logs/lang/profile_settings/focus_settings）。

**遗留**：1.3 渲染层异步化（`invoke('storage-set')`）按原计划不在本阶段，后续单独立项。

---

## Phase 2 — 打包配置（P0，零风险，可立即执行）

> **进度：2.1–2.5 全部完成并实测通过；Phase 2 已于 2026-09-19 关闭。**

### 2.1 开启 asar ✅ 已完成

`package.json` 的 `build` 块：`"asar": true`。本项目无原生模块，无需 `asarUnpack`。收益：源码不裸露、冷启动更快。

### 2.2 删除 `extraResources` 重复 ✅ 已完成

`extraResources`（`package.json:86-94`）把 `build/` 复制到 `resources/build/`，而 `files` 已把 `build/` 放进 `resources/app/build/`。`electron.js` 的 `__dirname` 是 `resources/app`，所以 `extraResources` 那份**从未被读取**，纯属浪费。删除该配置块。

### 2.3 清理杂散产物 ✅ 已完成

> **勘误**：杂散产物实际位于 **`out/`**（electron-builder 的输出目录），不是 `build/`——`build/` 本身只含 CRA 产物。已删除 `out/android/`（内含 `MyLifeOS-0.1.1-phase3-debug.apk`）、`out/MyLifeOS-0.1.2-debug.apk` 以及旧的 `out/win-unpacked/`（其中 `resources/build/` 正是 2.2 的重复副本）。

新增 `clean:build` 脚本（`scripts/clean-build.js`，入口 `npm run clean:build`）：`build/` 仅保留 `index.html`/`manifest.json`/`asset-manifest.json`/`static/`，其余（exe、apk、`win-unpacked/`、`android/`、`builder-debug.yml` 等）一律删除，可重复执行；`electron:build` 在 `verify:release`（会重跑 `react-scripts build`）之后、`electron-builder` 之前执行它。

### 2.4 升级 Electron ✅ 已完成

Electron 已由 27.3.11 升至 44.4.2，`electron-builder` 由 24.13.3 升至 26.16.1，并锁定具体版本。Node.js 基线明确为 22.12.0+，Windows 构建明确为 x64。`electron:build` 现在显式使用 `--publish never`，即使存在 `CI=true` 也不会尝试发布；打包成功后会自动运行启动冒烟与打包功能回归。

**2026-09-19 验证结果**：8 个测试套件 / 54 个测试通过；生产构建和 4 个主进程入口检查通过；Electron 44 安装包、解包应用、全新临时 profile 和离线渲染均通过。自动回归覆盖单实例、任务创建与排期、同步存储、真实 JSON 导出/导入、重启持久化、画像页面、番茄钟开始/暂停/重启恢复/继续/停止、完成事件、离线过期恢复及完成任务。Electron 27 生成的数据与暂停计时器可由 Electron 44 直接读取。原生通知 API 返回支持并触发 `show` 事件。NSIS 旧版安装、同目录覆盖升级和静默卸载均返回 0，升级与卸载期间现有 `app-data.json` 哈希保持不变。

安装包由 94,734,015 B 增至 139,177,150 B，主要来自 Electron/Chromium 跨大版本升级；`app.asar` 由 163,513,747 B 降至 150,128,868 B。`react-scripts` 生产依赖瘦身仍作为独立后续事项，不阻塞 Phase 2 完成。

### 2.5 收敛打包工具 ✅ 已完成

`electron-packager`（`package:win` 脚本）与 `electron-builder` 并存。移除 `electron-packager` 依赖与 `package:win` 脚本，统一用 `electron:build`（NSIS 安装包）。建议同时评估把 `react-scripts` 从 `dependencies` 迁到 `devDependencies`（它现在被整个打进 `app.asar`，是 156 MB 体积的主要来源；electron-builder 会因它自动套用 `react-cra` preset，迁移后需复核）。

**本次结论（2026-09-18）**：已移除 `electron-packager` 依赖与 `package:win` 脚本，打包入口收敛为 `npm run electron:build` 单一路径，`RELEASE_CHECKS.md` 的打包命令清单同步更新。`react-scripts` 仍留在 `dependencies`：把 `@capacitor/*`（Android 分支）之外的构建期依赖下沉虽有体积收益，但 electron-builder 会依据依赖位置套用 `react-cra` preset，需连同打包产物一起实测，故单独立项，不混在本次收敛里。

**验证**：`npm run electron:build` 产物体积显著下降；安装后 `loadFile` 正常加载、番茄钟/恢复流程正常。

### Phase 2 执行记录（2026-09-16，分支 `codex/windows-desktop`）

已完成 2.1–2.3。改动文件：`package.json`（`asar: true`、删除 `extraResources`、新增 `clean:build` 与 `smoke:packaged` 并接入 `electron:build`）、新增 `scripts/clean-build.js`、新增 `scripts/smoke-packaged.js`（打包产物冒烟检查）、`RELEASE_CHECKS.md`（新增「Packaged smoke test」与「Packaging hygiene」两节）。

实测证据：

| 项目 | 改进前 | 改进后 |
|---|---|---|
| NSIS 安装包 | 111,107,830 B | **94,734,014 B（−16.4 MB，−14.7%）** |
| `out/win-unpacked/resources/` | `app/`（内含 `app/build/`）+ **`build/`（重复副本）** | 仅 `app.asar` + `app-update.yml` + `elevate.exe` |
| `app.asar` | — | 163,513,747 B（156 MB，大头是 `node_modules`） |

- `npm run verify:release` 全绿：8 个测试套件 / 53 个测试通过、CRA 生产构建成功、4 个主进程入口语法检查通过。
- `npm run electron:build` 完整跑通并生成安装包；`app.asar` 顶层条目 = `assets, build, electron.js, electron-timer-restore.js, electron-window-target.js, node_modules, package.json, preload.js`，`build/index.html`、`build/static/js/*`、`assets/icon.ico` 均在包内。
- 打包后启动实测：`[MyLifeOS] Loading file: ...\resources\app.asar\build\index.html`，无 `did-fail-load`；窗口正常显示，`%APPDATA%/MyLifeOS/app-data.json` 经 preload + `sendSync` IPC 正常读写。

- 新增 `npm run smoke:packaged`（`scripts/smoke-packaged.js`）：用一次性 `--user-data-dir` 启动打包产物 + CDP 探针，断言页面渲染完成、`#root` 有内容、`window.electronAPI` 暴露 `sendSync`、无渲染进程异常、进程存活。实测 PASS（exit 0，`readyState=complete`、渲染文本 353 字）；并用空白 Electron 默认 app 做反向对照，正确 FAIL（exit 1，指出"#root 缺失 / preload 桥缺失"）。

**后续与已排查项**：

1. 打包机需网络下载 Electron 二进制（105 MB）。GitHub 直连失败（`read tcp ... wsarecv: An existing connection was forcibly closed`），改用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后 4.65 s 完成；`nsis`/`winCodeSign` 已有本地缓存。建议把该环境变量写进打包文档或脚本。同一镜像也可修复本地开发运行时——本次排查发现 `node_modules/electron/dist` 缺失，导致 `npm run prod` / `electron:dev` 根本起不来，用 `node node_modules/electron/install.js` 已修复。
2. ~~全新 profile 首启动疑似异常（待排查）~~ → **已排查结案：非应用缺陷**。证据：dev 模式全新 profile 存活、打包产物分离启动存活 50 s+、重定向启动存活 20 s+；CDP 探针确认新装首启动渲染健康（UI 正常渲染、preload 桥暴露 `invoke/send/sendSync/on`、0 条 error/warning）。唯一可复现的"自行退出"来自单实例锁：同一 `--user-data-dir` 起第二个实例会立即退出（stdout 只剩 `--- ELECTRON PROCESS STARTING ---`），与当时观测特征吻合——那次是排查过程中残留的实例占着同一 profile 的锁。另：全新 profile 不写 `app-data.json` 属正常（仅数据变化时落盘）。该盲区已由 `npm run smoke:packaged` 覆盖，勿再依赖"看有没有 app-data.json"来判断首启动是否正常。
3. `react-scripts` 位于 `dependencies`（非 `devDependencies`），被整个打进 `app.asar`（156 MB 的主要来源）；迁到 `devDependencies` 可大幅瘦身，属依赖分类变更，建议与 2.5 一并处理。

---

## Phase 3 — 键盘可用性（P1，纯 renderer，可并行）

> **进度：3.1–3.4 已于 2026-09-19 完成并实测通过（提交 `09cd952`）；Phase 3 关闭。**

### 3.1 通用 Modal 基础设施 ✅ 已完成

新增 `src/hooks/useModalBehavior.ts`（或 `src/components/Modal.tsx` 包装器）：

- `Escape` 键关闭
- 焦点陷阱（Tab/Shift+Tab 循环于 modal 内可聚焦元素）
- 打开时聚焦首个输入框/主按钮，关闭后焦点归还触发元素
- 注入 `role="dialog"` / `aria-modal="true"`

应用到全部 8 个弹窗：`AlertModal`、`ConfirmModal`、`HabitConfig`、`ManualTaskModal`、`TimePickerModal`、`TaskReviewModal`、`RecoveryModal`、`PomodoroTimer`。`AlertModal`/`ConfirmModal` 补 `role="alertdialog"`；`ConfirmModal` 默认聚焦「取消」按钮（破坏性操作防误触）。

### 3.2 TaskCard 键盘可达 ✅ 已完成

`TaskCard.tsx:66` 根 div 补 `role="button"`、`tabIndex={0}`、`onKeyDown`（Enter/Space 触发 `onClick`）；hover-only 操作按钮补 `aria-label`。删除未被任何调用方使用的 `compact` 死 prop。

### 3.3 渲染性能 ✅ 已完成

- `TaskCard` 包 `React.memo`；`App.tsx:307/438` 的箭头函数改为 `useCallback` 稳定引用 → 消除整列表重渲染
- `TimePickerModal.tsx:20-35` 的 O(48 × 任务数) 槽位计算包 `useMemo([dailyTasks, task, timelineMode])`
- 修复 `HabitConfig.tsx:108`、`ManualTaskModal.tsx:33` 的 `useState(getGoals())` 为懒初始化 `useState(() => getGoals())`
- 抽取共享 `PrioritySelector` 组件，消除 `PRIORITY_BUTTON_KEYS` 及 P1/P2/P3 网格的两处重复（`HabitConfig.tsx:28-32/491-516` ≡ `ManualTaskModal.tsx:8-12/121-142`）

### 3.4 i18n 与无障碍一致性 ✅ 已完成

- `LanguageContext.tsx`：`t` 用 `useCallback([language])` 包裹；语言切换时同步 `document.documentElement.lang`；新增系统语言检测（`navigator.language` 首次启动，默认 `'zh'` 保留为兜底）
- `index.css`：补 `:focus-visible` 全局样式与 `prefers-reduced-motion` 规则

**验证**：纯键盘走查全流程（新建任务→排期→番茄钟→完成→删除）；新增 `useModalBehavior` 单测；`npm run verify:release`。

### Phase 3 执行记录（2026-09-19，分支 `codex/windows-desktop`，提交 `09cd952`）

- 新增 `src/hooks/useModalBehavior.ts`（Escape 关闭、Tab/Shift+Tab 焦点陷阱、打开时聚焦首个可聚焦元素或 `initialFocusSelector`、关闭后焦点归还触发元素、注入 `role="dialog"`/`aria-modal`）与 `src/hooks/useModalBehavior.test.tsx`（5 个用例：焦点进出、Escape、Tab/Shift+Tab 循环、`initialFocusSelector`、`closeOnEscape=false`）。
- 应用到全部 8 个弹窗：`AlertModal`/`ConfirmModal` 用 `role="alertdialog"`（ConfirmModal 默认聚焦「取消」防误触），`HabitConfig`、`ManualTaskModal`、`TimePickerModal`、`TaskReviewModal`、`RecoveryModal`（Escape 映射为「稍后」而非丢弃恢复）、`PomodoroTimer`（Escape 关闭计时器覆盖层）。
- `TaskCard`：`role="button"` + `tabIndex={0}` + Enter/Space 触发 `onClick`（内部原生按钮自行处理按键）；4 个 hover-only 操作按钮补 `aria-label`；删除 `compact` 死 prop；整体包 `React.memo`。
- 渲染性能：`App.tsx` 的 `onClick`/`onDragStart` 改 `useCallback` 稳定引用；`TimePickerModal` 槽位计算包 `useMemo([dailyTasks, task, timelineMode])`；`HabitConfig`/`ManualTaskModal` 的 `useState(getGoals())` 改懒初始化；抽取共享 `PrioritySelector` 组件（两处 P1/P2/P3 网格去重）。
- i18n：`LanguageContext` 的 `t` 包 `useCallback([language])`；语言切换同步 `<html lang>`；首次启动系统语言检测（`zh*` → zh、`en*` → en、已存偏好优先）。`index.css` 补 `:focus-visible` 焦点框与 `prefers-reduced-motion`。
- 测试修正：`PomodoroTimer.test.tsx` 固定存储语言偏好为 `zh`（此前依赖 jsdom 默认 en-US 恰好回落 zh；引入系统语言检测后该隐式假设失效，断言变成机器区域设置无关）。

实测证据：`npm run verify:release` 全绿 —— 10 个测试套件 / 65 个测试通过（新增 5 个 `useModalBehavior` 用例）、CRA 构建成功、主进程 `tsc` 通过；Electron 冒烟启动正常（窗口创建并加载 `build/index.html`）。

---

## Phase 4 — 桌面原生能力（P2，依赖 Phase 0）

> **进度：4.1–4.4 已于 2026-09-19 完成并实测通过；4.5（自动更新）按原计划单独立项，Phase 4 关闭。**

### 4.1 系统托盘 ✅ 已完成

- 用 `assets/icon.ico` 创建 `Tray`，右键菜单：显示窗口 / 退出
- 「最小化到托盘」设置项（`desktopSettings`，默认开），关闭按钮最小化到托盘而非退出
- 托盘图标点击恢复窗口（复用现有 `second-instance` 逻辑）

### 4.2 原生保存对话框 ✅ 已完成

备份导出现在走 Chromium blob 下载（默认下载目录、无保存位置选择）。新增 IPC 通道 `dialog-save-backup`，主进程调 `dialog.showSaveDialog`（过滤器 `*.json`），把备份内容写入用户选定路径。`platformFiles.ts` 的 Electron 分支走该通道，浏览器分支保留 blob 下载。

### 4.3 窗口状态持久化 ✅ 已完成

主进程维护 `userData/window-state.json`，记录 `bounds`（x/y/width/height）与 `isMaximized`；`createWindow` 时恢复；`resize`/`move`/`maximize` 事件防抖落盘。

### 4.4 本地快捷键 ✅ 已完成

渲染进程 `useEffect` 注册（无需 `globalShortcut`，避免与系统快捷键冲突）：

- `Ctrl/Cmd+1` → planner，`Ctrl/Cmd+2` → profile
- `Esc` → 关闭番茄钟计时器（与 3.1 的 modal Escape 统一管理）
- `N` → 新建任务（planner 视图下）

### 4.5（可选）自动更新

引入 `electron-updater` + `publish: github`。独立大块，建议单独立项——先确认发布渠道再推进。

**验证**：托盘最小化/恢复；备份导出弹出原生对话框；窗口尺寸重启后保持；快捷键生效；`npm run verify:release`。

### Phase 4 执行记录（2026-09-19，分支 `codex/windows-desktop`）

- **4.1 系统托盘**：主进程用 `assets/icon.ico` 创建 `Tray`，右键菜单「显示窗口 / 退出 MyLifeOS」（文案跟随已存语言设置）；点击托盘图标恢复窗口；新增 `desktopSettings`（`mylifeos_desktop_settings`，`minimizeToTray` 默认开），开启时点关闭按钮只隐藏窗口，托盘退出或 `app.quit()`（`isQuitting` 标志）才真正退出，避免托盘残留进程。设置开关 UI 在 HabitConfig 新增「桌面端」区块。
- **4.2 原生保存对话框**：新增 IPC 通道 `dialog-save-backup`（`ipcMain.handle` + `dialog.showSaveDialog`，`*.json` 过滤器，缺 content 时直接返回错误不弹窗），`preload` 白名单加入该通道，`src/electron.d.ts` 补类型；新 `src/services/platformFiles.ts` 的 `saveJSONFile`：Electron 走原生对话框（返回所选路径，取消返回 null），浏览器/Android 保留 blob 下载。`HabitConfig` 的备份导出与恢复前备份改走该通道，成功后提示保存路径。
- **4.3 窗口状态持久化**：主进程维护 `userData/window-state.json`（bounds + `isMaximized`，最大化时存 `getNormalBounds()`），`createWindow` 恢复并设 `minWidth/minHeight`；`resize/move/maximize/unmaximize` 事件 400ms 防抖落盘，`close` 与 `before-quit` 同步强制 flush。`src/main/window-state.ts` 负责归一化（非法/缺失回退 1200×800），配 4 个单测。
- **4.4 本地快捷键**：渲染进程 `window` 级 `keydown`（不用 `globalShortcut`）：`Ctrl/Cmd+1` → planner、`Ctrl/Cmd+2` → profile、`N` → 新建任务（仅 planner 视图、非输入框聚焦、无其他弹窗时）；Esc 关弹窗由 3.1 的 `useModalBehavior` 统一管理。
- 新增 `scripts/verify-native.js`（`npm run verify:native`）：隔离 `--user-data-dir` 启动 + CDP 探针，覆盖窗口状态恢复、对话框通道白名单、快捷键、WM_CLOSE 隐藏到托盘、second-instance 经 `showMainWindow` 恢复窗口、`window-state.json` 落盘，全自动化。

实测证据（`npm run verify:native` PASS + `npm run verify:release` 全绿 11 套件/69 测试）：

- 种子 `window-state.json {x:60,y:45,1024x640}` 启动后 CDP 实测 `window.screenX/Y=60/45`、外框 1026×644（Windows 边框度量差在容差内）。
- `dialog-save-backup` 探针返回 `{"ok":false,"error":"Missing backup content"}` —— 通道已白名单且主进程校验生效（未弹窗）。
- Ctrl+2 → profile、Ctrl+1 → planner（导航按钮激活态实测翻转）；`N` 打开临时任务弹窗、Escape 关闭。
- WM_CLOSE 后主进程存活、主窗口 `IsWindowVisible=false`（隐藏到托盘）；随后 second-instance 触发 `showMainWindow`，同一句柄恢复 `visible=true`，第二实例因单实例锁退出。
- 退出后 `window-state.json` = `{x:60,y:45,width:1026,height:644,isMaximized:false}`。

**遗留**：4.5 自动更新（electron-updater + publish: github）需先确认发布渠道，单独立项。

---

## 贯穿各阶段：文档与测试

> **进度：跨阶段文档与测试任务已于 2026-09-19 完成。**

- ✅ `docs/*.md` 的机器专属绝对路径已改为仓库相对路径；架构和数据流入口同步到 `src/main/*.ts`
- ✅ `DEPENDENCY_UPGRADE_RESEARCH.md` 已删除 Tailwind/字体依赖 CDN 的过时论断，并记录 Electron 与打包工具升级完成状态
- ✅ 新增 `USER_GUIDE.md`：Windows 启动/托盘/快捷键、`%APPDATA%/MyLifeOS/` 数据文件、手动备份、恢复点和常见问题
- ✅ 各阶段配套单测已覆盖主进程存储缓存、`useModalBehavior`、窗口状态，以及恢复前备份和恢复点安全迁移
- ✅ `RELEASE_CHECKS.md` 已补大备份导入性能、磁盘满或写拒绝、崩溃时 `app-data.json` 完整性三项隔离环境人工回归步骤
- ✅ `start-local.ps1` 每次启动前运行 `npm run build:main`，干净克隆和分支切换都不再依赖残留编译产物

## 关键文件索引

| 文件 | 作用 |
|---|---|
| `src/main/electron.ts:627` | 存储 IPC（Phase 1.1） |
| `src/main/electron.ts:651` | 窗口创建与桌面原生能力（Phase 4） |
| `src/main/preload.ts` | channel 白名单（Phase 4.2） |
| `src/services/storage/localStorageStore.ts:23-50` | 桌面存储桥（Phase 1.3 改造点） |
| `src/services/storage/recoveryPointService.ts` | 恢复点（Phase 1.2 改造点） |
| `src/hooks/useAppController.ts` | 统一状态控制器 |
| `src/components/TaskCard.tsx:66` | 键盘可达性（Phase 3.2） |
| `src/components/TimePickerModal.tsx:20-35` | 槽位计算 memo 化（Phase 3.3） |
| `src/contexts/LanguageContext.tsx` | i18n（Phase 3.4） |
| `package.json:51-79` | electron-builder 配置（Phase 2） |
