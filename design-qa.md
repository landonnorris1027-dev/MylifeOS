# MyLifeOS · Rare UI 组件适配 QA

日期：2026-10-17。分支：`codex/fluid-interactions`。本次为现有应用中的设计适配；保留白蓝界面和任务数据契约。

## 比较依据与证据

参考：[Duration Picker](https://www.rareui.com/components/durationpicker)、[Delete Button](https://www.rareui.com/components/deletebutton)。线上演示返回 Vercel 429，未绕过检查；改用作者[公开源码](https://github.com/swamimalode07/rare-ui/tree/9633fcfa81c212a0ba48507e9c56be4869d61928/components/ui)固定版本在本地运行原始组件。截图不是线上页面截图。参考容器补齐字体回退和透明输入背景，以适配本项目 Tailwind 版本。

- Source visual truth：`docs/ui-motion/rare-ui/reference-open-final.png`、`reference-rest-final.png`。
- Rendered implementation：`docs/ui-motion/rare-ui/06-duration-open-final.png`、`05-duration-rest-final.png`、`07-task-delete-open.png`、`08-habit-delete-open.png`。
- 本地实现：<http://127.0.0.1:3100/>。
- Full-view comparison：原始组件演示与应用表单/卡片画面在同一次图像比较输入中查看，检查整体层级、密度及控件位置。原始参考是独立组件容器，应用是实际表单；不将周边布局差异当作组件失真。
- Focused region comparison：`reference-duration-open.png` 对 `app-duration-open.png`；`reference-delete-open.png` 对 `app-delete-open.png`。两组图像分别在同一次比较输入中检查图标、间距、颜色与轮廓。

## 视口、状态与密度

| 比较 | 源图像 | 实现图像 | CSS 视口与状态 |
| --- | --- | --- | --- |
| 桌面整体 | 1440×1000 | 1440×1000 | 1440×1000；浅色；展开编辑/删除确认 |
| 时长特写 | 254×49 | 234×49 | 同为 1 小时 30 分钟，编辑已展开 |
| 删除特写 | 132×48 | 133×49 | 标准桌面尺寸，确认已展开 |
| 中文窄屏 | 独立组件参考 | 320×844、390×844 | 任务表单展开；320px 触屏删除展开 |
| 英文窄屏 | 英文原始组件 | 390×844 | 英文任务表单展开 |

全部截图 deviceScaleFactor=1，1 CSS px 对应 1 图像像素；元素特写多出的 1px 来自分数坐标取整，未进行缩放。闭合参考默认 90 分钟、应用默认 25 分钟，闭合图仅比较形态；精细时长比较采用同为 90 分钟的展开图。

## Findings 与修正历史

1. **[P2，已修复] 入场缩放影响胶囊蒙版。** 首轮 `04-duration-rest.png` 出现分段接缝。测得蒙版高 46.32px，控件布局高 48px。测量改用 `offsetSize`，避免读取弹窗入场中的缩放尺寸。复拍 `05-duration-rest-final.png`、`06-duration-open-final.png`，分段衔接和高度正常。
2. **[P2，已修复] 桌面删除确认过宽。** 初轮将标准 48px 按钮误判为触屏，面板总宽 160px；原始参考为 132px。改为按 coarse pointer 选择触屏面板，桌面面板宽 84px，触屏宽 112px。复拍 `app-delete-open.png` 对照 `reference-delete-open.png`，桌面间距恢复。
3. **[P2，已修复] 关闭的确认面板造成横向溢出。** `mobile-320-initial.png` 对应 document clientWidth=312、scrollWidth=350；隐藏但未裁切的面板向右伸出。为动画外壳添加 overflow:hidden，并将焦点描边放入控件内部。复拍 `mobile-320-duration.png`、`mobile-320-touch-delete.png`，320px 桌面模拟的 scrollWidth=clientWidth=312，触屏为 320；控件完整可见。390/768/1440px 和英文 390px 同样无横向溢出。

最终比较无未解决的 P0/P1/P2。

## 五项视觉检查

| 表面 | 检查结果与有意适配 |
| --- | --- |
| 字体与排版 | 保留应用 system-ui / Segoe UI 回退；时长数字 15px、单位 12px，较独立参考略紧凑，使中文 320px 表单可容纳。等宽数字、加粗层级、中英文换行正常。 |
| 间距与布局 | 保留 48px 胶囊高度、8px 展开间距和 squircle 圆角；任务卡片桌面删除入口缩为 32px，习惯规则为 48px；触屏均扩大到 48px。展开向卡片内部延伸，不推动列表。 |
| 颜色与令牌 | 保留参考的灰紫表面 #f4f4f9 和内凹面 #e7e7ef；使用更深的单位文字、橙色确认勾和应用蓝色焦点环。应用主操作仍为蓝色。 |
| 图像与资源 | 无新增栅格图片。铅笔、勾号、垃圾桶盖和桶体路径来自原始源码；使用原始路径形变与 squircle 计算，未用替代插画。第三方版权、完整许可与 README 可见署名已加入。 |
| 文案与内容 | 时长显示中文小时/分钟或英文 hr/min；明确 1–180 分钟范围。习惯标题改为“单次时长”。确认按钮具有对应操作的可访问名称；等待、失败、成功有状态提示。 |

## 交互与验证

- 临时任务和习惯均将 1h30 保存为 90 总分钟；仍使用现有 1–180 分钟契约。
- 铅笔到勾号的中间路径实际改变；分段弹簧、轻微摆动、删除桶盖与确认面板过渡在浏览器运行。
- 时长编辑第一下 Escape 恢复原值并保持弹窗；第二下关闭弹窗。删除支持取消、Escape 和点击外部，首击不执行删除、不打开排期。
- 删除当天任务后可撤销；减少每日数量只有一次行内确认；删除习惯规则通过虚构数据验证。
- 单元测试验证等待期间只提交一次、失败不假报成功、错误后允许重试。
- 中文 320/390/768/1440px，英文 390px：无页面横向溢出。触屏三个删除控件均为 48×48px，滚动后完整可用。
- 动态切换 reduced-motion 后，展开间距立即为 8px、输入宽 36px、CSS transitionDuration=0s。
- 实际浏览器流程无 pageerror；检查最新控制台未发现应用错误。
- 最终 `npm run typecheck`、42 个测试文件 / 291 项测试、`npm run build`、`git diff --check` 通过。

## Open Questions / Follow-up Polish

无阻塞问题。生产构建有单个 legacy chunk 超过 500kB 的体积提示（668.26kB，gzip 203.14kB）；可作为后续按需加载优化。本次未运行 Windows 安装包或 Android 真机验收，也未发布部署。

## Implementation Checklist

- [x] 原始参考和应用画面同次比较，含特写。
- [x] P2 问题修正并复拍。
- [x] 中英文、窄屏、触屏、键盘及 reduced-motion 验证。
- [x] 版权声明、完整许可与来源署名。
- [x] 类型、回归、生产构建和差异检查。

final result: passed
