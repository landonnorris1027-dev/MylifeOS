# MyLifeOS

简要说明：此仓库包含基于 React + Electron 的桌面应用源码。仓库中部分历史大文件已迁移到 Git LFS，构建产物与可执行文件被加入 `.gitignore`，不会随仓库直接提供。

必要前提
- Git（命令行）和 Git LFS
- Node.js（建议 16 或 18）和 npm

快速上手

1. 克隆仓库并获取 LFS 对象

```bash
git clone https://github.com/landonnorris1027-dev/MylifeOS.git
cd MylifeOS
git lfs install
git lfs pull
```

2. 安装依赖

```bash
npm install
```

3. 开发运行（React 开发服务器 + Electron）

```bash
npm run electron:dev
```

4. 仅前端开发

```bash
npm start
```

5. 生成生产构建并打包安装程序

```bash
npm run electron:build
```

注意事项
- 仓库中可执行文件、安装包与构建产物已加入 `.gitignore`，因此克隆后不会包含二进制发行包。若需要安装包，请在本地运行 `npm run electron:build` 或在 GitHub Releases 下载作者上传的构建文件。
- 如果克隆者未安装 Git LFS，`git lfs pull` 之后会缺少大文件（只会拿到指针文件），会导致构建或运行失败。
- 推荐使用 Node 16/18。在遇到二进制兼容问题时，请尝试切换 Node 版本（如使用 `nvm`/`nvm-windows`）。
<img width="1771" height="1183" alt="image" src="https://github.com/user-attachments/assets/54b233cd-d33f-4e3c-aaf9-a19b11d73bbf" />


