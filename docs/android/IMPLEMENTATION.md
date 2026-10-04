# MyLifeOS 安卓 0.1.4

业务基于桌面主线 e135105，安卓工程基于 170e8bf；实施分支 `codex/android-reliability`。
本版保持个人离线使用，加入原生可靠性接口与手机执行入口。

## 存储与升级

`platform.ts` 选择 Electron、Android、浏览器。Android 在 React 挂载前载入原生快照，业务读取使用内存缓存。
业务与会话写入通过同一前端队列，再由原生串行执行器和跨接收器共享锁提交。
应用私有 `noBackupFilesDir/mylifeos/app-data.json` 使用 AtomicFile、文件同步和读回校验；独立 `app-data.previous.json` 保留上一份验证成功的快照。
选择 AtomicFile 后仍需自行串行化访问，这与 [官方 AtomicFile 文档](https://developer.android.com/reference/android/util/AtomicFile) 的锁责任一致。

首次启动从 `CapacitorStorage` Preferences 与 WebView 旧值迁移；有 `mylifeos_native_dirty:` 标记时优先候选 WebView 值。
迁移成功保留旧来源。旧专注/休息会话也迁移，旧休息的专注任务先补成完成记录。
业务文件承担持续增长的数据；Preferences 只保留旧来源与小型提醒认领元数据，符合 [Preferences 的轻量键值定位](https://capacitorjs.com/docs/apis/preferences)。

失败会回到已落盘缓存、冻结编辑并保留最新候选。重试会重新读取修订号，保持整体导入的 replace 语义，并重试未成功确认的计时意图。
暂停/继续使用幂等动作；开始使用稳定会话 ID，防止确认丢失后重试启动两次。
排队中的修改不会被较旧查询响应覆盖。待保存导出可附带失败计时操作，导入器不恢复这些运行状态。
整体提交及其重试期间冻结编辑与会话操作，只在共享队列空闲后报告已保存；损坏 WebView 缓存不会遮住有效原生快照。

正常导入或恢复必须先成功保存外部恢复前备份、内部恢复点，且没有未结束会话。
原生整体替换再次检查会话，跨日改期一次替换包含两天的日志值，避免源和目标只改一半。
恢复点最多七份；业务备份包含偏好，默认 v7，支持旧 v1–v6；明确标记的 v6 导出不含振动。
孤立的习惯任务独立验证并保留完成状态及分钟。

主文件与上一份都无法读取时进入恢复页。用户先点击“停止当前计时器”，撤销旧闹钟并保存与损坏源指纹对应的恢复授权。
不能把读取失败当作没有会话。确认恢复会先归档损坏文件；来源改变、停止记录或归档失败均拒绝覆盖。
归档及旧 Preferences/WebView 不会自动清理，便于人工回退。

## 计时与提醒

原生快照持有截止时间、暂停剩余时间、稳定 ID 和完成账本。任务完成、分钟、会话终态同一次提交。
广播在 WebView 或进程未运行时也能保存；重复广播和重复核对不会重复计入。
延迟送达按原截止时间计算，提前完成按实际已专注时间计算。
开始、暂停、继续、停止均等待原生结果；关闭计时页面继续运行。完成后先显示已保存，再选择休息或返回计划。

自动到点和手动完成共用原生提醒认领，业务提交在提醒前完成；稳定 ID 的已送达标记避免二者竞态发声两次。
声音与振动选择独立，后台使用相应的有声/静音渠道；遵守系统静音、勿扰和渠道限制。
没有精确闹钟能力时使用允许延迟的闹钟，并显示“提醒可能延迟”。设置页提供通知、渠道、精确闹钟入口。
返回应用重核会话并重设活动闹钟；重启或包升级也从原生会话重建提醒，涵盖提交后、设闹钟前进程结束的情况。
权限和送达边界参照 [Android 闹钟文档](https://developer.android.com/develop/background-work/services/alarms)。

保存备份通过系统 ACTION_CREATE_DOCUMENT，写入、flush、close 成功后才报告保存；取消则中止覆盖。
分享只打开分享流程，返回不代表备份已保存，参照 [系统文档接口](https://developer.android.com/training/data-storage/shared/documents-files)。

## 手机执行

沿用主线的搜索、跨日改期、十秒撤销、工作日/自选星期，以及习惯与设置分离。
补充待办/时间轴切换、固定新增、当前时段定位、触屏直接显示操作、48px 主要目标、安全区域和键盘 resize。
系统返回先关闭最上层弹窗，再回计划页；计划页返回将应用置于后台。计时面板关闭不停止会话。

## 构建

Node >=22.12、JDK 21、SDK 36、Build Tools 36.0.0；依赖由 package-lock 固定，推荐 `npm ci`。
本机 Java 位于 `D:/AndroidToolchain/jdk-dist/jdk-21.0.12.1+1`，SDK 位于 `D:/AndroidToolchain/sdk`。

```powershell
$env:JAVA_HOME='D:\AndroidToolchain\jdk-dist\jdk-21.0.12.1+1'
$env:ANDROID_HOME='D:\AndroidToolchain\sdk'
npm run android:verify
```

入口执行共享类型/测试、Electron 合约检查、生产 Web 构建、Capacitor 同步、10 项原生 JVM 规则测试、Release Lint、个人 Release APK 与仪器测试 APK 编译。
中文 Windows 路径使用经验证的 ASCII Junction，仅用于构建工具；不移动源文件或应用数据。
`android/local.properties` 与构建缓存不提交，设置 ANDROID_HOME 后可在新检出中构建。

为保持旧包升级身份，独立密钥位于仓库外 `D:/AndroidToolchain/signing/mylifeos-personal-upgrade.keystore`；原密钥保留。
其他机器设置 MYLIFEOS_KEYSTORE，以及需要时的 MYLIFEOS_STORE_PASSWORD、MYLIFEOS_KEY_ALIAS、MYLIFEOS_KEY_PASSWORD。
不要为覆盖升级生成新证书。证书 SHA256 固定在 `android/personal-signing.json`，验证入口同时检查旧 APK 指纹。
虽然沿用旧 Debug 证书身份，个人 Release 包的 `debuggable=false`；密钥不进入 Git 或 APK。

产物：`out/android/MyLifeOS-0.1.4-personal.apk` 与 `out/android/verification.json`。
元数据包含提交、工作区是否脏、源码树摘要、版本、证书、APK SHA256、大小和各验证结果。
旧 APK 保留于 `out/android-baseline/MyLifeOS-0.1.2.apk`。

## 设备验收入口

8 项 NativeSnapshotStore 仪器测试覆盖原子替换失败、损坏回退、未完成会话门禁、指纹恢复授权、旧来源保留、幂等动作、重复接收与中途 .new 文件。
另有旧包种入合成数据和新版验证两项升级测试，以及包名检查。编译不能代替设备执行。

在全新的专用 `mylifeos-verify-api-24/33/36` AVD 上启动后运行：

```powershell
npm run android:verify:emulator -- emulator-5554
```

入口拒绝手机、其他 AVD 和已有 MyLifeOS 数据的 AVD。它安装旧包、种入孤立完成任务及暂停会话、覆盖安装新版、验证数据，再跑原生存储测试并保存启动截图。
需先运行 android:verify。普通 Gradle connectedDebugAndroidTest 默认会扫描旧版种入测试，应指定 NativeSnapshotStoreTest 类，或使用上述升级入口。

实际锁屏、系统回收、重启、权限拒绝/再开启、静音、振动、省电及小米策略仍需要设备记录。
360–430dp 完整触屏流程、键盘/系统返回和 v6 与桌面 0.1.3 实际文件交换也属于设备/UI验收。
测试环境遇到阻碍时保留证据，不把静态检查或单元测试写成设备通过。
