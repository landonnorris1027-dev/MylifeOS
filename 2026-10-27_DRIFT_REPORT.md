## docs/ARCHITECTURE.md

核对日期：2026-10-27（Asia/Shanghai）。范围：时间线排期、专注计时、备份恢复。基准为当前工作区源码，HEAD 为 `fc6f1aeeff25ce63c5769e59817c39c81a1289e3`，`package.json` 版本为 `0.1.10`；不据此推断某个已安装 APK／Windows 程序的行为。

> 历史快照说明：本报告描述检查时的基线。此后排期精度已调整为仅 30 分钟，ARCHITECTURE.md 中的对应表述也已更新；D01 不再代表后续提交的当前状态。链接固定指向检查时的基线，便于复核当时的证据。

本报告记录 **1 处直接表述不一致、8 项文档覆盖缺口**。覆盖缺口指源码中的当前规则没有在目标文档中明确表达，不等同于业务代码错误或缺失功能。文档中明确标注 0.1.1／0.1.2／0.1.3／Windows 0.1.8 的段落按版本上下文解读，不因其与当前行为不同而直接判为缺陷。其他文档不在本次被审对象范围内。

方法：静态读取目标文档、实现及调用关系；未运行应用、构建、单元测试、备份导入或恢复操作，未读取用户业务数据。所有行号以本次核对时的文件为准。本次只创建此报告。

- **D01｜时间线排期｜直接不一致：5 分钟仍被写为当前选择器选项。**

  **文档位置：** [ARCHITECTURE.md:21](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L21)，`TimePickerModal: 5/15/30-minute scheduling picker`。

  **源码依据：** [src/App.tsx:314–316](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/App.tsx#L314) 的实际下拉选项仅为 `[15,30]`；[TimePickerModal.tsx:9–18](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/TimePickerModal.tsx#L9) 的参数类型为 `15 | 30`；[plannerSettings.ts:14–24](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/plannerSettings.ts#L14) 将读取到的旧 `5` 归一化为 `15`。

  **差异与边界：** 当前可选粒度为 15／30 分钟。5 分钟仍出现在[备份校验和归一化代码:282–285](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L282)，其含义是接受旧数据并转换，并非当前 UI 仍支持该选项。应校准当前选项说明，另列旧值兼容行为；不能把保留 `5` 的解析分支误报为未删除的功能缺陷。

- **D02｜时间线排期｜覆盖缺口：时间窗口与可排时间边界没有明确描述。**

  **文档位置：** [ARCHITECTURE.md:21](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L21) 只说明粒度与重叠阻止；[43–45 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L43) 只将服务概括为时段计算和重叠检查。

  **源码依据：** [scheduling.ts:27–61](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/scheduling.ts#L27) 对“今天”按所选粒度向上取整得到最早开始时间，并要求任务结束不晚于当天 24:00；[65–87 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/scheduling.ts#L65) 区分 `daytime` 与 `fullDay`，当前分别从 08:00 和 00:00 生成时段；[TimePickerModal.tsx:25–40](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/TimePickerModal.tsx#L25) 合并时间边界、已过时段和重叠条件；[useAppController.ts:627–655](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/hooks/useAppController.ts#L627) 和 [675–700 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/hooks/useAppController.ts#L675) 在确认／拖放时再次校验。

  **差异与边界：** 当前排期策略超过“有重叠就阻止”。尤其“已过时段”校验仅针对今天，不能从文档推导为一律禁止查看或排入过去日期。建议补充模式、当天边界和 UI／控制器双层校验的职责；这里报告的是策略未写明，不判定该策略本身错误。

- **D03｜专注计时｜覆盖缺口：运行中计时状态与可备份会话记录的模型没有完整区分。**

  **文档位置：** [ARCHITECTURE.md:87–89](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L87) 对两种存储文件的内容列举较简；[125–131 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L125) 的核心模型只有 `Habit`、`Task`、`DailyData`。[143 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L143) 已提及 durable timer／outbox，但没有展开数据契约。

  **源码依据：** [focus-runtime.ts:11–29](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L11) 定义运行时 `FocusTimer`，以及 `activeTimers`、`pendingRecoveries`、`pendingCompletions`、`completedChoices`；[focus-session.ts:1–19](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-session.ts#L1) 另定义 `FocusSession` 和 `mylifeos_focus_sessions`，包含 `plannedSeconds`、`actualFocusSeconds`、`startedAt`、`endedAt`、`result`、`measurement`；[focus-runtime.ts:216–267](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L216) 表明主动停止的专注也形成会话记录，完成专注才同步更新任务完成状态，休息不生成专注记录。

  **差异与边界：** `pomodoro-state.json` 的可重放运行时状态和业务快照中的专注历史不是同一个模型，不能把业务备份中的会话记录理解为可直接继续运行的计时器。建议补充模型所在文件、字段单位、停止／完成／休息的归档语义。旧计时快照兼容读取见 [focus-runtime.ts:104–118](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L104)，不应因存在旧快照归一化代码而认定当前仍只使用旧模型。

- **D04｜专注计时恢复｜覆盖缺口：离线超时恢复的操作结果与估算归类没有说明。**

  **文档位置：** [ARCHITECTURE.md:23](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L23) 只说明 `RecoveryModal` 处理过期离线会话；[69–71 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L69) 只说明持久化及排入恢复队列。

  **源码依据：** [electron-timer-restore.ts:24–49](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/electron-timer-restore.ts#L24) 分别处理运行和暂停快照；[focus-runtime.ts:108–118](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L108) 将恢复时已超时的状态转为待处理恢复项；[314–354 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L314) 中，focus 恢复选择 `complete`／`resume-break` 可生成 `measurement: 'estimated'` 的完成记录，`dismiss` 不走该记账分支；[focusReports.ts:48–56](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/focusReports.ts#L48) 将估算会话计入历史时长，排除在实际计时总量之外。

  **差异与边界：** 文档未表达“恢复动作不只是关闭提示，且恢复确认形成的估算不等于实际计时”。这也不能与 [ARCHITECTURE.md:141](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L141) 的 `Task.historicalFocusMinutes` 混为一谈：该段限定的是旧任务保留估算字段不被合成为会话，而这里的估算会话来自离线计时恢复。两种来源应分开说明，不能据此宣称第 141 行与当前实现矛盾。

- **D05｜备份格式｜覆盖缺口：缺少统一的当前 v8 格式与显式 v6／v7 兼容导出说明。**

  **文档位置：** [ARCHITECTURE.md:112–123](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L112) 主要记录 v5／v6 演进；[141 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L141) 已提到 v8 及兼容导出的历史字段省略，但不是完整的当前格式契约。

  **源码依据：** [localStorageStore.ts:5–19](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/localStorageStore.ts#L5) 指定当前 `DATA_SCHEMA_VERSION = 8`；[backupService.ts:263–285](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L263) 区分旧版补值、v7 振动偏好、v8 排期精度和未来版本拒绝；[301–312 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L301) 及 [367–376 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L367) 表明 v8 读写专注会话；[417–442 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L417) 对 v6／v7 显式省略会话、排期精度及保留历史时长，并将临时任务 `none` 映射为 `P3`，v6 还省略振动偏好。

  **差异与边界：** 应将“当前完整 v8”和“面向旧客户端的有损交换格式”单列。[中文 UI 文案:29–33](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/locales/zh.ts#L29) 将两种交换格式分别标为桌面 0.1.3（v6）与 Android 0.1.4（v7），不是指当前 Android 只能使用 v7。原文的 v5／v6 历史叙述不能因当前为 v8 而判错；缺口在于当前格式及有损转换边界尚未系统列明，也不能要求修改历史格式以加入新字段。

- **D06｜备份恢复｜覆盖缺口：整体提交前的计时会话门禁没有明确表达。**

  **文档位置：** [ARCHITECTURE.md:113–117](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L113) 说明整体提交与恢复点落盘；[139、143 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L139) 描述部分恢复及计时架构，但没有列出禁止恢复的会话状态。

  **源码依据：** [focus-runtime.ts:143–161](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/focus-runtime.ts#L143) 中 `blocksRestore()` 检查活动／暂停计时器、待完成 outbox、待处理离线恢复以及待重试候选；[electron.ts:298–312](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/main/electron.ts#L298) 在实际 `storage-commit` 前执行门禁及 `prepareRestore()`。安卓还在 [backupService.ts:388–392](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L388) 检查非完成会话，并在 [NativeSnapshotStore.java:147–149、191–193](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/NativeSnapshotStore.java#L147) 的原生替换路径再次检查。

  **差异与边界：** 文档容易被理解为“备份通过校验即可覆盖”，实际还需要先结束／处理阻塞会话，或走显式放弃与归档流程。建议分别标明桌面与安卓门禁，而非笼统承诺所有平台处理完全相同。该门禁是当前保护策略，不是旧备份无法兼容的证据；`recover=true` 也不是通用的跳过所有门禁开关。

- **D07｜常规备份恢复｜覆盖缺口：外部操作前备份、内部恢复点和分享的确认语义未区分。**

  **文档位置：** [ARCHITECTURE.md:77](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L77) 仅列出 native backup dialog；[113–117 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L113) 只说明内部恢复点在破坏性操作前落盘。

  **源码依据：** [HabitConfig.tsx:408–443](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/HabitConfig.tsx#L408) 的常规文件导入先预览、确认，再保存外部操作前备份，取消或失败即中止；[337–356 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/HabitConfig.tsx#L337) 恢复内部恢复点也先经过外部备份；[storage.ts:81–86](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage.ts#L81) 和 [recoveryPointService.ts:126–130](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/recoveryPointService.ts#L126) 另创建并 flush 内部操作前恢复点。[platformFiles.ts:38–79](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/platformFiles.ts#L38) 则区分保存、浏览器下载和安卓分享；[HabitConfig.tsx:303–312](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/HabitConfig.tsx#L303) 的分享分支直接返回，不据此报告文件已保存。

  **差异与边界：** “内部恢复点落盘”不能替代“用户选定的外部备份成功”；分享流程返回也不能证明文件已保存。这里限定的是 `HabitConfig` 常规恢复入口，不能推广为存储损坏时的 `StorageBoundary` 恢复同样总能先导出完整旧数据。浏览器下载返回文件名也不等于获得了与原生文件写入相同的磁盘确认。建议补充这些当前前置条件与平台保证范围。

- **D08｜待保存数据导出｜覆盖缺口：导出的计时救援信息并不由常规备份导入恢复运行。**

  **文档位置：** [ARCHITECTURE.md:104–110](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L104) 的 0.1.2 段落说明候选快照可重试／导出；[143 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L143) 提到 outbox，但没有说明当前救援导出与常规导入之间的边界。

  **源码依据：** [StorageBoundary.tsx:64–75](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/components/StorageBoundary.tsx#L64) 的待保存导出附带桌面 `unsavedTimerState` 或安卓 `unsavedTimerOperation`；[backupService.ts:304–312](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L304) 只输出归一化后的业务字段、设置与历史会话，[395–402 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/storage/backupService.ts#L395) 也仅提交这些字段。全 `src` 检索这两个救援字段只找到上述导出写入点，没有常规导入恢复它们的读取点。

  **差异与边界：** 此类导出可以保存待落盘业务数据及计时意图证据，但不能从文档的“可导出”推导出“导入后继续未完成计时器／自动重放该意图”。建议明确便携历史与运行时救援信息的区别；这是当前导入契约的文档缺口，不将有意不恢复运行状态直接定性为历史记录丢失，也不推翻原文对旧版本候选快照的说明。

- **D09｜跨平台计时与损坏恢复｜范围缺口：当前原生安卓实现未在桌面架构说明之外获得对应说明。**

  **文档位置：** [ARCHITECTURE.md:5–9](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L5) 明确以桌面分层为起点；[84–110 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L84) 描述桌面文件与损坏恢复；[133 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L133) 提到浏览器回退；[145 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/docs/ARCHITECTURE.md#L145) 在 Windows 0.1.8 边界段中只带过原生安卓继续保留独立运行时。

  **源码依据：** [index.tsx:34–42](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/index.tsx#L34) 和 [electronIPC.ts:76–97](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/src/services/electronIPC.ts#L76) 区分原生安卓、Electron 和浏览器路径；[NativeSnapshotStore.java:25–33](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/NativeSnapshotStore.java#L25) 将安卓数据放在应用私有 `noBackupFilesDir/mylifeos/`，使用 `app-data.json`、独立 previous 和 recovery-control 文件；[241–259 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/NativeSnapshotStore.java#L241) 直接核对并完成到点会话；[SnapshotRules.java:188–235](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/SnapshotRules.java#L188) 写入公共专注历史，并按是否有起始时间区分 measured／estimated。损坏恢复在 [NativeSnapshotStore.java:130–148](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/NativeSnapshotStore.java#L130) 校验停止授权指纹并归档原文件；[177–187 行](https://github.com/landonnorris1027-dev/MylifeOS/blob/fc6f1aeeff25ce63c5769e59817c39c81a1289e3/android/app/src/main/java/com/mylifeos/app/NativeSnapshotStore.java#L177) 生成该停止授权。

  **差异与边界：** 作为“当前源码架构”参照，文档缺少安卓计时落盘、直接完成及恢复授权的对应路径。不能把桌面 `RecoveryModal` 离线处理机制、`.bak` 文件布局或浏览器回退语义直接套用于安卓；也不能把公共会话格式理解为相同的底层状态机。这是范围补充缺口，不认定桌面专用段落或 Windows 0.1.8 的历史说明错误，更不把旧数据的 estimated 兼容分支报告为当前实际计时故障。
