# MyLifeOS 应用图标 · 方案 1

设计日期：2026-10-20。图像由内置 image_gen 生成。

## 设计

相连的圆角时间块组成字母 m，呼应 MyLifeOS 的习惯、日程与专注流程。紫色和蓝色延续任务与统计配色，右上角的暖黄色圆点表示当前时刻及临时任务。浅色背景和充足留白与应用中的圆角卡片保持一致。

- 图标原图：`mylifeos-icon-v1.png`，实际输出为 1254 × 1254 像素、RGB PNG。
- 配色依据：`src/index.css` 中的 P1 紫色 `#9d7bf5`、P2 蓝色 `#5b8def` 与临时任务黄色 `#f2c46d`；背景采用界面的浅色系。
- 小尺寸预览：`preview.html`，包含 32 / 48 / 64 像素与系统圆角裁切示意。
- 当前交付：已接入应用默认图标。应用左上角、Windows 窗口/托盘/安装包、网页标签与安装图标、Android 启动图标均使用该设计；Android 通知使用相同轮廓的单色图标。

## 视觉检查

已在真实浏览器中检查 32 / 48 / 64 像素显示及深色背景示意：圆角 m 的主体与黄色点仍可区分，图形没有依赖细线或文字。`preview.png` 保存了该预览页面。

## 默认图标接入与验证

- 应用内标志：`src/App.tsx` 使用 `public/assets/icons/app-64.png`；实际页面见 `default-header.png`。
- Windows：`assets/icon.ico` 包含 16 / 24 / 32 / 48 / 64 / 128 / 256 像素图像；窗口、托盘和安装包沿用已有 ICO 引用。已从打包后的 EXE 提取并目视核对新图标。
- 网页：`index.html` 配置 favicon、Apple touch icon 和 manifest；manifest 包含 192 / 512 像素与 maskable 图标。新资源在浏览器中均返回 200，控制台错误为 0。
- Android：更新 mdpi–xxxhdpi 的启动图标与自适应前景、旧版启动图标引用、启动页图标及通知轮廓；保留现有包名、版本与签名身份。`:app:processDebugResources --offline` 编译通过，未执行手机安装。
- 裁切验证：彩色图案最远半径分别为 maskable 图标边长的 0.3912（安全上限 0.4）和 Android 前景边长的 0.2966（安全上限 33/108）；黄色圆点也在安全区内。
- 本机 Windows：已重建 `out/windows/0.1.8/` 中的客户端及安装包，并更新现有桌面快捷方式的图标；快捷方式的程序路径、参数和个人数据目录保持原值。原快捷方式已备份到本机忽略目录 `.local-archive/default-app-icon-20261020/`。
- 验证：`npm run electron:build` 完整通过，含 43 个测试文件 / 296 项测试、类型检查、前端和主进程构建、启动冒烟与完整安装包回归。新安装包为 `out/windows/0.1.8/MyLifeOS Setup 0.1.8.exe`。

修改原图后，在 Windows 上运行 `npm run icons:generate`，即可用 `scripts/generate-app-icons.ps1` 重新导出所有尺寸。生成脚本保留原设计，仅进行尺寸与格式转换、平台安全边距适配。

## 生成提示词

```text
Use case: logo-brand.
Asset type: a single finished minimalist application icon for MyLifeOS, an offline personal planner for Windows and Android.
Product: recurring habits generate daily task blocks; users arrange a timeline, focus on tasks, and review measured progress. Existing interface is calm, airy, white, with softly rounded cards, blue primary controls and purple/blue/pale-blue/yellow category colours.
Primary request: Design ONE distinctive, exceptionally simple app icon. Create a bold rounded geometric lowercase-m / M monogram constructed from two connected soft time-block arches. The mark should communicate a calm daily rhythm and purposeful forward movement. Its silhouette must clearly read as an abstract M, with generous open negative space beneath the two arches. Make the left portion soft violet #9d7bf5 and the right portion cornflower blue #5b8def. Add just ONE small warm yellow #f2c46d circular dot, neatly separated near the upper right of the mark, evoking the present moment and one completed task. Pale blue #9ab8db may appear only if structurally useful; do not force all colours into the mark.
Composition: square 1024 by 1024 icon master. Opaque clean off-white #f8fafd full-bleed canvas. Center a single flat emblem in the middle 60-65% of the square, optically balanced with ample quiet padding, suitable for operating-system rounded masks. Strong substantial strokes, smoothly rounded endpoints and corners, accurate symmetric architecture with the yellow dot as the only asymmetrical accent. Crisp vector-like shapes and clean edges. No extra outer tile outline or presentation surface.
Style: refined, understated, warm, contemporary flat geometric brand mark; premium independent productivity application, not childish. The shape must remain recognizable at 32 pixels.
Text: NONE; the M itself is an abstract graphic, no wordmark.
Avoid: multi-icon sheets, mockups, captions, logos on devices, comparison boards, literal calendar or clock illustration, small checklists, graph axes, extra rings, extra dots, decorative sparkles, flowers, leaves, mascots, hearts, infinity symbols, glossy 3D, embossing, texture, drop shadows, gradients, hairline strokes, photographic imagery, watermark. Do not imitate an existing corporate logo.
```
