# 金币记账本 📒

一只小账本陪你一起记账的记账应用，采用**深海蓝**主题配色：深海蓝 + 浅蓝 + 白 + 樱花粉、圆角卡片，吉祥物是可爱的 **Q 版记账本**（奶油底 + 薄荷绿书皮 + 金硬币 + 铅笔，见 `temp/007.jpg`）。

提供两种形态：
- **安卓 APP**（APK 安装包，可直接装到手机）
- **PWA 网页版**（浏览器打开即用，可「添加到主屏幕」）

## 功能

- **今日**：今日支出 / 收入 / 结余卡片 + 今日账单列表
- **明细（日历视图）**：月历展示每天收支，点选某天查看当天明细
- **记一笔**：支出 / 收入切换、数字键盘、彩色分类图标、备注、日期；**分类区在上方可上下滑动、金额键盘与「保存」固定在屏幕底部**、内置**分类管理快捷入口**
- **分类**：内置 26 个默认分类 + 预设图标库，支持**新增自定义分类**、**自由调整分类顺序**
- **统计图表**：本月收支**折线图**（总收支/收入/支出三类切换，滑动高亮当日数据、点击跳转当日明细）、分类占比环形图、近 6 个月趋势柱状图
- **预算**：设置每月预算，图表页显示进度条与超支提醒
- **数据**：本地持久化，支持导出 / 导入 JSON 备份、清空数据
- **离线**：安卓 APK 与 PWA 均可离线使用，自带 Q 版记账本吉祥物图标

## 安卓 APK

已构建好的安装包在项目根目录：

- **`金币记账本-v2.9.apk`**（约 7.9 MB，debug 签名，可直接安装；旧版本名为「鲸鱼记账」「快速记账本」，同一 applicationId 覆盖安装、账目数据保留）

安装到手机：把 APK 传到手机（微信/QQ/数据线均可）→ 点击安装 → 允许「安装未知来源应用」即可。支持 Android 7.0（API 24）及以上。

重新构建 APK（需要本机已装 Android SDK + JDK）：

```bash
# 1. 安装依赖（首次）
npm install

# 2. 把根目录源码同步到 www/，再同步进安卓工程
npm run android:sync

# 3. 构建 debug APK
pwsh -File build-android.ps1 assembleDebug
# 或一条命令走完 2 + 3：npm run android:build
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

> `npm run sync:www` 会把根目录的 `index.html`、`manifest.json`、`sw.js`、`css/`、`js/`、`icons/` 镜像到 `www/`，并删掉 `www/` 里源码中已不存在的残留文件（避免旧副本被打包进 APK）。

> 构建脚本 `build-android.ps1` 已内置本机的 SDK / Gradle 缓存路径（`GRADLE_USER_HOME`、`ANDROID_HOME`），并统一把 build-tools 固定为 36.0.0、调试签名指向项目内 `android/debug.keystore`。若换机器需按需调整这些路径。

## PWA 网页版

需要 Node.js（无需任何 npm 依赖）：

```bash
node server.js
```

浏览器打开 **http://127.0.0.1:4173/** 即可使用。手机 Chrome / Edge 打开后点菜单 →「添加到主屏幕」即可当 App 用（离线 + 安装需 `localhost` 或 HTTPS）。

## 项目结构

```
jizhang/
├── index.html              入口页面
├── manifest.json           PWA 清单
├── sw.js                   离线缓存 Service Worker
├── server.js               本地静态服务器
├── capacitor.config.json   Capacitor 配置
├── build-android.ps1       安卓构建脚本
├── 金币记账本-v2.9.apk        构建产物（安装包）
├── www/                    Capacitor 打包用的 web 资产
├── android/                Capacitor 生成的安卓工程
├── css/style.css           全部样式
├── js/
│   ├── utils.js            金额/日期等工具函数
│   ├── store.js            分类 + 本地数据层
│   ├── charts.js           SVG 图表 + 账本吉祥物
│   └── app.js              主应用逻辑（五大视图）
├── icons/                  应用图标 + 吉祥物（PNG）
└── tools/
    ├── sync-www.mjs          把根目录源码镜像到 www/（清残留文件）
    ├── gen-mascot-007.mjs    从 temp/007.jpg 抠出吉祥物 + 生成全部图标/启动屏（当前使用）
    ├── gen-icons.mjs         PWA 图标 PNG 生成脚本（旧版手绘鲸鱼）
    └── gen-android-icons.mjs 安卓图标/启动屏生成脚本（旧版手绘鲸鱼）
```

## 说明

- 金额以「分」为整数存储，避免浮点误差
- 数据仅保存在本机，请定期用「我的 → 导出数据」备份
- 修改吉祥物/图标后运行 `node tools/gen-mascot-007.mjs`，会重生成 `icons/mascot.png`、PWA 图标、安卓 launcher/round/foreground 与启动屏（并把自适应图标底色写成奶油白 `#FDF6E3`）
