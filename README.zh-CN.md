# MyLifeOS

[English](README.md) | [简体中文](README.zh-CN.md)

MyLifeOS 是面向 Windows 与 Android 的离线效率应用，使用 React、TypeScript、桌面端 Electron 和安卓端 Capacitor。它整合习惯规则、每日任务、时间线排期、专注计时和画像统计。另有浏览器预览，使用独立的浏览器本地数据。

当前源码版本为 **0.1.4**。安卓个人 APK 基于 `codex/android-reliability` 的 `b2164cb` 构建，设备验收仍待完成。这不会自动更新电脑上已安装的 Windows 应用。

## 功能

- 设置习惯的优先级、数量、时长、日期范围，以及每天、工作日或自选星期
- 按规则自动生成每日任务
- 点击任务安排时间，或拖到时间线，并检查时间冲突
- 搜索任务、将未完成临时任务跨日改期、在当日删除后十秒内撤销
- 手机切换待办池与时间线，使用固定新增入口，跳到当前时段
- Windows 与 Android 使用原生计时；安卓先保存完成记录，再选择是否休息
- 导出完整 v7 备份、导入 v1–v6 备份、导出供桌面 0.1.3 交换的 v6 文件
- 原生平台显示保存/恢复状态，保留失败修改供重试或导出
- 查看全年专注活动和画像统计

## 技术栈

- React 18
- TypeScript
- Electron
- Android 使用 Capacitor 8
- Electron `userData` 中的本地文件存储
- Android 应用私有原子 JSON 快照及独立的上一份有效副本
- 非 Electron 浏览器运行时的本地存储

## 日常流程

1. 在习惯配置中创建或修改规则。
2. 打开某天，应用按当前规则核对任务。
3. 将待办池任务安排到时间线。
4. 点击已排期任务，开始专注。
5. 安卓等待完成记录保存，再选择“开始休息”或“返回计划”。Windows/网页目前先进入休息流程。
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

保持进程运行，打开 [http://localhost:3000](http://localhost:3000)。不要双击 `public/index.html`：它是空的源码模板，开发服务器会注入应用脚本。网页数据与 Windows、安卓数据分开；网页计时不具备原生后台保障。

启动网页与 Electron 开发模式：

```bash
npm run electron:dev
```

从生产网页构建启动桌面应用：

```bash
npm run build
npm run prod
```

Windows 启动脚本与快捷方式见使用指南。拉取或切换分支后，使用脚本前先重新构建前端；脚本仅在构建文件缺失时自动生成它。

运行质量检查：

```bash
npm run verify:release
```

构建 Windows 桌面安装包：

```bash
npm run electron:build
```

Windows 安装包输出到 `out/`。打包会执行安装包启动与功能回归；覆盖范围及网络镜像配置见发布检查表。

## 发布检查

见 [RELEASE_CHECKS.md](RELEASE_CHECKS.md)。

## 安卓个人 APK

安卓要求 **Android 7 或以上**（最低 SDK 24，目标 SDK 36）。把 `out/android/MyLifeOS-0.1.4-personal.apk` 传到手机安装。先备份旧应用，再使用同证书覆盖升级；实际安装升级的数据保留仍待设备验证。

Windows 源码、安卓与网页通过平台适配层共用业务代码。默认备份为 v7，包含振动偏好。在安卓“设置 → 数据管理”选择**导出桌面 0.1.3 兼容备份（v6）**，与桌面 0.1.3 交换文件；v6 不携带振动。**分享完整备份**不代表备份文件已保存。导入或恢复前，必须结束安卓活动或暂停中的会话。

准备 Node.js 22.12+、JDK 21、SDK/Build Tools 36 和保留的个人签名密钥后构建：

```bash
npm run android:verify
```

按[安卓实现说明](docs/android/IMPLEMENTATION.md)设置 `JAVA_HOME`、`ANDROID_HOME`，必要时设置 `MYLIFEOS_KEYSTORE`。入口检查类型、共享测试、生产构建、原生 JVM 测试、Lint、APK 签名和清单，并编译仪器测试；不会安装到手机。

产物为 `out/android/MyLifeOS-0.1.4-personal.apk` 和 `out/android/verification.json`。APK 沿用旧证书身份，关闭调试；元数据记录源码提交、版本、证书、SHA-256 和检查结果。生成的 APK 与私有密钥不提交到 Git。

`b2164cb` 构建通过 **143 项共享测试、10 项原生 JVM 测试**；Release Lint 为 **0 错误、19 警告**。仪器测试已编译、未执行。Android 7/13/16、实际覆盖升级、锁屏/重启/省电行为和完整手机操作仍待验收，见[验证与设备验收](docs/android/VALIDATION.md)。这些结果对应该构建，不代表后续检出均已验证。

## 更多文档

- [English user guide](USER_GUIDE.en.md)
- [中文使用指南](USER_GUIDE.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_FLOW.md](docs/DATA_FLOW.md)
- [docs/DEPENDENCY_UPGRADE_RESEARCH.md](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
