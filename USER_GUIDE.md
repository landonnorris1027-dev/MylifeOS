# MyLifeOS 使用说明 / User Guide

[中文](#中文使用说明) · [English](#english-user-guide)

## 中文使用说明

### 1. 安装

#### Android

1. 将 APK 文件发送到手机并打开。
2. 如果系统拦截安装，请仅为当前文件来源临时允许“安装未知应用”。
3. 若覆盖安装时提示签名冲突，请先在旧版本中导出备份，再卸载旧版本并安装新版本。
4. 当前测试包支持 Android 7.0 及以上版本，并锁定为竖屏显示。

#### Windows

运行项目生成的 Windows 安装程序，并按照安装向导完成安装。Windows 与 Android 版本使用相同的主要界面和任务工作流，但各自独立保存本地数据。

### 2. 快速开始

1. 打开“习惯”页面，创建习惯并设置优先级、每日数量、默认时长和生效日期。
2. 返回“计划”页面，应用会根据习惯规则生成当天任务。
3. 将待办池中的任务安排到时间线。
4. 点击已安排的任务，开始专注计时。
5. 完成专注和休息后，可在“画像”页面查看统计结果。

### 3. 专注计时和通知

- Android 和 Windows 均使用持久化截止时间，切换应用或短暂熄屏不会造成明显计时漂移。
- 可以暂停、继续、提前完成或跳过休息。
- Android 进程被系统回收后，重新打开应用会恢复计时并处理已经结束的阶段。
- 首次使用通知时，建议允许“通知”和“闹钟与提醒”权限，以获得更及时的完成提醒。
- 拒绝通知或精确定时权限不会阻止应用内计时，但系统提醒可能延迟或不显示。
- 如果应用在专注结束前被完全终止，系统可显示已安排的完成通知；自动进入休息及任务结算会在重新打开应用后继续处理。

### 4. 小米/HyperOS 使用建议

- 允许 MyLifeOS 显示通知。
- 如需更准时的后台提醒，允许闹钟与提醒权限。
- 如果系统频繁终止应用，可在电池管理中降低对 MyLifeOS 的后台限制。
- 不同 HyperOS 版本的设置名称和位置可能不同，请以手机当前系统界面为准。

### 5. 数据备份和恢复

- 在习惯配置页面导出 JSON 备份。
- Android 会打开系统分享面板，可将备份保存到文件、网盘或发送到其他设备。
- 恢复时选择之前导出的 JSON 文件；应用会先校验备份格式，再写入数据。
- 覆盖安装通常会保留数据，但卸载应用通常会清除本地数据。卸载前请先导出备份。
- Android 与 Windows 不会自动同步数据，可以通过 JSON 备份手动迁移。

### 6. 隐私

MyLifeOS 是本地优先应用。习惯、任务、统计和计时状态默认保存在当前设备，不会自动上传到云端。只有在你主动导出备份时，应用才会通过当前平台的导出流程创建可保存或分享的数据副本。

### 7. 常见问题

**收不到通知**  
检查系统通知权限、闹钟与提醒权限，以及电池后台限制。即使没有通知，重新打开应用后仍会根据保存的截止时间校准计时。

**覆盖安装失败**  
新旧 APK 的签名可能不同。先从旧版本导出备份，再卸载旧版本并安装新版。

**顶部状态栏显示异常**  
确认安装的是最新 APK。应用已为状态栏安全区增加固定的半透明虚化层；通知中心本身的模糊效果仍由 HyperOS 控制。

---

## English User Guide

### 1. Installation

#### Android

1. Transfer the APK to your phone and open it.
2. If Android blocks the installation, temporarily allow “Install unknown apps” only for the app that opened the APK.
3. If an update reports a signature conflict, export a backup from the old version before uninstalling it and installing the new version.
4. The current test build supports Android 7.0 and newer and is locked to portrait orientation.

#### Windows

Run the generated Windows installer and follow its setup wizard. The Windows and Android editions share the main interface and task workflow, but each keeps its own local data.

### 2. Quick start

1. Open Habits and create a habit with its priority, daily quota, default duration, and effective dates.
2. Return to Planner. The app generates today's tasks from the active habit rules.
3. Move tasks from the inbox onto the timeline.
4. Select a scheduled task to begin a focus session.
5. After completing focus and break sessions, review the results in Profile.

### 3. Focus timers and notifications

- Android and Windows use persistent wall-clock deadlines, preventing significant timer drift while the app is backgrounded or the screen is briefly off.
- You can pause, resume, complete a focus session early, or skip a break.
- If Android terminates the app process, reopening the app restores the timer and processes an already elapsed stage.
- When notifications are first used, allow Notifications and Alarms & reminders for the most timely completion alerts.
- Denying notification or exact-alarm access does not stop the in-app timer, but system alerts may be delayed or omitted.
- If the app is fully terminated before a focus session ends, Android can still show the scheduled completion alert. Automatic break transition and task settlement continue when the app is reopened.

### 4. Xiaomi/HyperOS recommendations

- Allow MyLifeOS to display notifications.
- Allow Alarms & reminders when timely background alerts are important.
- If the system repeatedly terminates the app, reduce battery background restrictions for MyLifeOS.
- Setting names and locations vary between HyperOS versions; follow the labels shown by the phone's current system.

### 5. Backup and restore

- Export a JSON backup from the habit configuration screen.
- On Android, the system share sheet lets you save the backup to Files, a cloud drive, or another device.
- To restore, select a previously exported JSON file. The app validates the backup before writing any data.
- An in-place update normally retains data, but uninstalling the app normally removes local data. Export a backup before uninstalling.
- Android and Windows do not sync automatically. Use a JSON backup to migrate data manually.

### 6. Privacy

MyLifeOS is local-first. Habits, tasks, statistics, and timer state remain on the current device by default and are not uploaded automatically. Only an explicit backup export creates a portable copy through the current platform's save or share flow.

### 7. Troubleshooting

**Notifications do not appear**  
Check notification permission, Alarms & reminders access, and background battery restrictions. Even without an alert, reopening the app recalculates the timer from its saved deadline.

**An update cannot be installed**  
The old and new APKs may use different signatures. Export a backup from the old version, uninstall it, and then install the new version.

**The top status-bar area looks incorrect**  
Confirm that the latest APK is installed. The app includes a fixed translucent blur layer for the status-bar safe area; blur inside the notification shade itself is still controlled by HyperOS.
