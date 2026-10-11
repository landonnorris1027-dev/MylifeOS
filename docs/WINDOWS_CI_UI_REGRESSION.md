# Windows UI 分支的 CI 回归修复

日期：2026-10-09；分支：`codex/windows-ui-motion`；修复基线：`c5c3631`。

## 失败原因

代码推送成功，失败的是 Windows candidate 自动验证：

- [36f87ba 的失败运行](https://github.com/landonnorris1027-dev/MylifeOS/actions/runs/37873260685)
- [c5c3631 的失败运行](https://github.com/landonnorris1027-dev/MylifeOS/actions/runs/37876305513)

两次均已生成安装包并通过启动检查，但 `regression-packaged.js` 在点击搜索入口时超时。
旧脚本严格匹配按钮的 `innerText === "Find tasks"`；新版按钮包含 `Ctrl K` 提示，实际可访问名称仍为 `Find tasks`。
从最新源码重新运行 `npm run electron:build` 在本机复现同一失败；保留的旧安装包会通过，不能作为新版证据。

## 修复

- `scripts/packaged-ui.js` 提供共享的精确按钮定位函数；优先使用 `aria-labelledby` / `aria-label`，否则使用规范化文本。
- 排除禁用、隐藏和 inert 控件及隐藏祖先；同名可见控件有歧义时明确失败，并支持限定对话框范围。
- 将同一函数序列化到真实打包 renderer 中执行；新增 8 项单测，包括快捷键提示、图标控件、名称优先级、隐藏/禁用、歧义和序列化路径。
- 失败时输出按钮文字、可访问标签及禁用状态，便于直接定位问题。
- 桌面新增任务检查操作可见的 `New task` 主入口；旧脚本会直接点击已隐藏的移动端入口。
- 排期检查仅允许实际提供的 15 / 30 分钟，并检查选择生效及原有 `09:07` 排期保持；临时任务和计时夹具使用 `none`。
- 打包回归增加已完成卡片鼠标 / 键盘不可重启、无开始按钮、不可拖动和背景、文字、边框各 800ms 的过渡检查；显式模拟无减少动效偏好以确定该时长。

## 验证

保留完整质量检查、打包、冒烟、功能回归和原生检查，不延长失败超时或跳过失败步骤。
修复定位函数后，本地完整打包流水线（37 组 / 261 项单测、类型检查、构建、打包、冒烟及功能回归）和四个原生 P0 场景已通过。
最终提交仍需重新跑完整打包流水线，并核对 GitHub 上同一提交的运行结果。

```powershell
npm test -- src/packaged-ui.test.ts
npm run electron:build
npm run verify:p0-native
```

自动化使用一次性 profile；日常应用数据与安装保持原状。这次只修改 Windows 分支的测试工具，未更改产品界面、IPC、存储格式或 Android 分支。
CI 通过代表自动化检查完成；既有人工安装、系统休眠唤醒和签名等发布验收边界仍按原验证文档执行。
