# MyLifeOS

[English](README.md) | [简体中文](README.zh-CN.md)

MyLifeOS 是面向 Windows 与 Android 的离线效率应用，使用 React、TypeScript、桌面端 Electron 和安卓端 Capacitor。它整合习惯规则、每日任务、时间线排期、专注计时和画像统计。另有浏览器预览，使用独立的浏览器本地数据。

当前共享源码和安卓个人 APK 版本均为 **0.1.10**。安卓已统一使用新版 Windows 的画像、图表与实际专注统计，并修复原生保存／重试失败问题。本次未重新打包 Windows 安装程序，也不会自动更新已安装的应用。

## 功能

- 设置习惯的优先级、数量、时长、日期范围，以及每天、工作日或自选星期，按规则生成每日任务
- 新建临时任务不设优先级；已有及导入的临时任务同样使用紫色标签
- 点击或拖拽任务到时间线排期，检查时间冲突；Windows 和 Android 均使用 **30 分钟**排期网格
- 当天未完成的待办或已排期任务可直接“开始专注”，保留原排期
- 搜索任务；Windows 支持批量跨日改期未完成临时任务，本次运行内最多撤销 20 步任务操作
- 窄窗口和手机支持待办池／时间线切换
- Windows 与 Android 使用原生计时，支持暂停、继续、停止与恢复；专注／休息倒计时和累计时长以**分钟**显示，内部保留实际计时精度
- 完成记录保存成功后，再显示“开始休息／返回计划”；保存失败时保留修改供重试或导出
- 完成任务块经过 **800ms** 过渡变为标签色，文字同步变白；完成后不能再次启动专注
- 查看实际投入、历史估算、周目标、任务笔记和全年专注记录
- 导出完整 **v8** 备份，导入 v1–v8；与较早的 Android 0.1.4 APK 或 Windows 0.1.3 交换时，明确选择 v7 或 v6

## 最新 Windows 界面

规划页保留待办池与时间线布局，采用纯白底、蓝色主控件、圆角面板和统一字体。习惯标签为 P1 红、P2 黄、P3 绿，临时任务为紫色。临时任务和习惯配置的时长输入框均可清空后重新填写。

Windows 和 Android 均使用 30 分钟排期网格。旧的 5／15 分钟偏好在读取或备份导入时转换为 30 分钟，不移动已有任务的排期。Ctrl+K 搜索任务，Ctrl+J 打开当前会话，非输入框且无弹窗时 Ctrl+Z 撤销任务操作。删除提示也支持十秒内撤销。

完成卡片本体不再响应点击、Enter／空格键或拖拽，不能再次专注或重新排期；笔记／复盘与删除保留独立按钮。800ms 颜色过渡支持减少动态效果设置。倒计时向上取整至分钟，直至计时器确认结束；累计时长显示已投入的整分钟。内部时间戳与实际会话记录仍保留原精度。

Windows／浏览器的画像页沿用白底与蓝色风格：

- 深浅蓝分组柱图对比每日计划与实际投入，正负柱图显示“实际减计划”，原每日数值保留在明细表中。
- **每日／每周目标投入分布**采用带白色间隙的圆角粗环。颜色占比按**当前已完成任务关联的实际专注时长**计算，不按任务数量或计划时长计算。中心显示总分钟数，图例显示各类时长和百分比。
- 日环使用所选参考日期，周环使用该日期所在的本地周一至周日，不受“近七天”筛选影响。已完成任务此前主动停止的实际会话也计入投入；未完成、撤销完成、已删除、无法匹配任务的会话及估算不进入环形图。
- 实际汇总包含完成与主动停止的专注，排除暂停和休息；历史估算单独显示，周目标仅计实际投入。跨午夜会话归属原任务日期。
- 周复盘保留笔记、复盘、目标快照和关联会话，每页 25 项任务。
- 年度热力图采用不同层次的蓝色，桌面网格紧凑居中，方块约 16px、间距 2px；窄窗口可在图表内部横向滚动。安卓共用同一套实际计时数据与画像组件，并适配手机布局。

这些展示层调整保留原生计时接口与备份 schema，不会安装或更新已有应用。

## 界面预览

2026-10-14 设计检查补充：空待办池可直接新增任务；未完成待办卡片显示点击排期提示；“有笔记”与“已复盘”分开显示；计划总时长标为“计划投入”；桌面时间线提供跳到当前时段入口。新建任务自动聚焦名称输入框，排期和笔记弹窗补充名称及关闭按钮标签，320px 窄窗口与英文顶部工具栏调整换行。[截图评审及验证记录](docs/product-design-audit/REPORT.md)仅覆盖本地浏览器预览，不代表已安装应用更新或原生设备验收。

以下 Windows／浏览器截图均使用隔离的虚构数据。

### 规划页

![纯白规划页、蓝色操作控件及紫色临时任务标签](docs/manual-task-priority/planner.png)

### 每日／每周完成任务投入分布

![分段粗环展示每日和每周实际专注时长、分类及百分比](docs/profile-distribution/segmented-desktop.png)

### 年度专注记录

![紧凑居中的蓝色年度专注热力图](docs/profile-ui/compact-heatmap-desktop.png)

## 技术栈

- React 18
- TypeScript
- Vite 与 Vitest
- Electron
- Android 使用 Capacitor 8
- Electron `userData` 中的本地文件存储
- Android 应用私有原子 JSON 快照及独立的上一份有效副本
- 非 Electron 浏览器运行时的本地存储

## 日常流程

1. 在习惯配置中创建或修改规则。
2. 打开某天，应用按当前规则核对任务。
3. 将待办池任务安排到时间线。
4. 在当天未完成的待办或时间线任务上选择“开始专注”。
5. 等待完成记录保存，再选择“开始休息”或“返回计划”；保存失败时保留任务与恢复入口。
6. 查看统计，在“设置 → 数据管理”备份数据。

完整操作见[中文使用指南](USER_GUIDE.md)或 [English user guide](USER_GUIDE.en.md)。

## 主要目录

- [src/App.tsx](src/App.tsx)：顶层布局与页面组合
- [src/hooks/useAppController.ts](src/hooks/useAppController.ts)：统一应用状态与操作
- [src/components](src/components)：界面组件
- [src/services/storage.ts](src/services/storage.ts)：存储入口与统计辅助
- [src/services/storage](src/services/storage)：数据仓库、任务生成、备份导入导出
- [src/services/electronIPC.ts](src/services/electronIPC.ts)：渲染进程 Electron 接口
- [src/services/platform.ts](src/services/platform.ts)：平台选择
- [src/services/nativeRuntime.ts](src/services/nativeRuntime.ts)：安卓快照队列、保存状态、恢复与计时操作
- [android/app/src/main/java/com/mylifeos/app](android/app/src/main/java/com/mylifeos/app)：安卓存储、提醒与后台完成
- [src/services/scheduling.ts](src/services/scheduling.ts)：时间槽与冲突判断
- [src/main/electron.ts](src/main/electron.ts)：主进程、IPC、计时、存储、托盘与窗口生命周期
- [src/main/preload.ts](src/main/preload.ts)：渲染进程白名单接口

## 开发与启动

使用 Node.js 22.12.0 或更新版本。Windows x64 发布构建使用 Electron 44.4.2 和 electron-builder 26.16.1。

安装依赖：

```bash
npm ci
```

启动网页预览：

```bash
npm start
```

保持进程运行，打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。不要双击 `index.html`：Vite 通过开发服务器解析源码入口。网页数据与 Windows、安卓数据分开；网页计时不具备原生后台保障。

启动网页与 Electron 开发模式：

```bash
npm run electron:dev
```

从生产网页构建启动桌面应用：

```bash
npm run build
npm run prod
```

Windows 启动脚本与快捷方式见使用指南。启动器同时核对前端和主进程构建的源码指纹与提交；构建缺失或过期时，会同时重新构建两者。

运行质量检查：

```bash
npm run verify:release
```

构建 Windows 桌面安装包：

```bash
npm run electron:build
```

Windows 候选包输出到 `out/windows/<版本>/`，不会更新现有程序和快捷方式。打包会执行安装包启动与功能回归；覆盖范围及网络镜像配置见发布检查表。

## 发布检查

见 [RELEASE_CHECKS.md](RELEASE_CHECKS.md)。如需验证共享代码与 Android 编译，而不签名个人发布包或安装到设备，准备 JDK 21 和 Android SDK 后执行：

```bash
npm run android:verify:compile
```

最新安卓发布验证（2026-10-26，0.1.10）：**45 个文件／299 项共享测试**、前端与 Electron 类型检查、生产构建、Capacitor 同步、**25 项原生 JVM 测试**、Release Lint（**0 错误、32 警告**）、签名发布 APK 和仪器测试 APK 编译均通过。证书与 0.1.9 APK 一致。浏览器使用模拟安卓桥，在 360、412、480 CSS 像素宽度下完成交互与布局检查。本版尚未在手机或模拟器执行仪器测试及实际覆盖升级验证。

较早源码验证（2026-10-11）：

- Windows UI 改进通过 [PR #5](https://github.com/landonnorris1027-dev/MylifeOS/pull/5) 合并至 main，合并提交为 `3dee7d3`；对应的 [main Windows candidate 检查](https://github.com/landonnorris1027-dev/MylifeOS/actions/runs/38121511322)已通过。
- 集成提交 `43948b3`（与 `3dee7d3` 的应用源码树相同）通过 Android 仅编译验证：**40 个文件／273 项共享测试**、前端与 Electron 类型检查、生产构建、Capacitor 同步、**13 项原生 JVM 测试**、Debug Lint，以及调试 APK 和仪器测试 APK 编译。
- 仪器测试仅编译、未执行。手机验收与新版个人 APK 发布仍待完成；源码验证不会更新已安装的 Windows 或 Android 应用。

以上结果对应这些提交；后续检出应查看其对应的 Actions 与验证元数据。较早个人 APK 的验证记录在下节单独列出。

## 安卓个人 APK

安卓要求 **Android 7 或以上**（最低 SDK 24，目标 SDK 36）。把 `out/android/MyLifeOS-0.1.10-personal.apk` 传到手机安装。先备份旧应用，再使用同证书覆盖升级；实际安装升级的数据保留仍待设备验证。

Windows 源码、安卓与网页通过平台适配层共用业务代码。当前源码默认导出 v8，包含专注会话与排期精度。较早的个人 Android 0.1.4 APK 使用 v7，与该构建交换时应明确导出 v7。在安卓“设置 → 数据管理”选择**导出桌面 0.1.3 兼容备份（v6）**，与桌面 0.1.3 交换文件；v6 不携带振动。兼容导出不包含实际专注会话记录和排期精度，临时任务会以 P3 表示以供旧客户端读取；请同时保留完整 v8 备份。**分享完整备份**不代表备份文件已保存。导入或恢复前，必须结束或明确放弃活动、暂停或待处理的专注会话；导入／恢复也会创建操作前备份。

准备 Node.js 22.12+、JDK 21、SDK/Build Tools 36 和保留的个人签名密钥后构建：

```bash
npm run android:verify
```

按[安卓实现说明](docs/android/IMPLEMENTATION.md)设置 `JAVA_HOME`、`ANDROID_HOME`，必要时设置 `MYLIFEOS_KEYSTORE`。入口检查类型、共享测试、生产构建、原生 JVM 测试、Lint、APK 签名和清单，并编译仪器测试；不会安装到手机。

产物为 `out/android/MyLifeOS-0.1.10-personal.apk` 和 `out/android/verification.json`。APK 沿用旧证书身份，关闭调试；元数据记录源码提交、版本、证书、SHA-256 和检查结果。生成的 APK 与私有密钥不提交到 Git。

`b2164cb` 构建通过 **143 项共享测试、10 项原生 JVM 测试**；Release Lint 为 **0 错误、19 警告**。仪器测试已编译、未执行。Android 7/13/16、实际覆盖升级、锁屏/重启/省电行为和完整手机操作仍待验收，见[验证与设备验收](docs/android/VALIDATION.md)。这些结果对应该构建，不代表后续检出均已验证。

## 更多文档

时长选择器和删除按钮改编自 Swami Malode 的 [Rare UI](https://rareui.com)，许可及源码出处见[第三方声明](THIRD_PARTY_NOTICES.md)。

- [English user guide](USER_GUIDE.en.md)
- [中文使用指南](USER_GUIDE.md)
- [架构](docs/ARCHITECTURE.md)
- [数据流](docs/DATA_FLOW.md)
- [依赖升级研究](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
- [Windows 实施与验收](docs/WINDOWS_IMPROVEMENTS.md)
- [分钟显示与旧排期兼容](docs/MINUTE_DISPLAY.md)
- [临时任务优先级兼容](docs/MANUAL_TASK_PRIORITY.md)
- [任务完成动效与交互证据](docs/TASK_COMPLETION_MOTION.md)
- [画像图表设计与验证证据](docs/PROFILE_UI.md)

实施记录包含历史阶段的结果；当前行为与源码验证以上文为准。
