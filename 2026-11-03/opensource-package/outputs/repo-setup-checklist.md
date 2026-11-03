# 线城 / Linevale 仓库设置清单

- 日期：2026-11-03
- 对外名称：线城 / Linevale（已定稿）
- 仓库名 / GitHub slug：`micro-subway`（保持不变）
- 远端仓库：https://github.com/qweeqw231/micro-subway
- 克隆地址：`git clone https://github.com/qweeqw231/micro-subway.git`
- 本清单覆盖：About 文案、Topics、GitHub Pages、Discussions、首次 commit 顺序、徽章与 gh 命令

> 命名约定：`micro-subway` 只是仓库 slug；游戏对外名称是「线城 / Linevale」。

## 1. About

GitHub 的 About 只有一个 description 字段，不能同时填两版。建议以英文为主，中文版本可保留在本清单与 README 中备选。

### Description（英文，326 字符，含空格）

```text
Linevale (线城; repo: micro-subway) is a from-scratch, non-commercial transit line-planning game: draw metro lines, dispatch trains, carry passengers, pick weekly upgrades, and keep the network running until it jams. Web first, Windows desktop planned. Early design stage — no playable build yet. Not affiliated with Mini Metro.
```

### Description（中文，134 字符）

```text
《线城》（Linevale，仓库 slug：micro-subway）是一款从零实现的非商业地铁线路规划游戏：画线、调车、送客、每周选升级，撑到网络崩盘。Web 优先，Windows 桌面版后续推出。当前为早期设计阶段，尚无可玩版本。与 Mini Metro 无关联。
```

### Website

- Pages 首次部署成功前保持留空。
- 部署成功后填写 `https://qweeqw231.github.io/micro-subway/`。

## 2. Topics

建议填入以下 18 个标签（小写、连字符分隔，可直接复制）：

```text
linevale, game, web-game, browser-game, metro, transit, line-planning, typescript, react, canvas, canvas2d, vite, tauri, local-first, save-export, game-design, mit-license, non-commercial
```

选择理由：

- `linevale`：游戏英文名，作为唯一命名类标签。
- `game`、`web-game`、`browser-game`、`metro`、`transit`、`line-planning`：说明类型与题材，便于同好检索。
- `typescript`、`react`、`canvas`、`canvas2d`、`vite`、`tauri`：技术栈与桌面阶段方向。
- `local-first`、`save-export`：突出“本地存档 + 文件导出/导入”这一设计差异点。
- `game-design`：当前仓库的主要内容是设计文档。
- `mit-license`、`non-commercial`：说明授权结构（代码 MIT，素材非商业）。

不建议使用 `micro-subway`、`subway` 这类与仓库 slug 或题材泛称重叠的命名标签，也不使用 `mini-metro`、`dinosaur-polo-club` 等原作名称，以减少“slug 被当成游戏名”的误解和商标混淆。题材检索已由 `metro`、`transit` 覆盖。

## 3. GitHub Pages

### 推荐方式：GitHub Actions 构建并部署

适用前提：Web 脚手架与 `npm run build` 已存在。当前仓库没有可构建内容，因此**先不要开启 Pages**。

步骤：

1. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
2. 添加 `.github/workflows/deploy.yml`，依次完成：检出代码、安装 Node.js LTS、执行 `npm ci`（或 `npm install`）、执行 `npm run build`、用官方 Pages 发布 action 上传 `dist/` 并部署。action 名称与版本以 GitHub 官方 Pages 文档为准。
3. 工作流需要 `pages: write` 与 `id-token: write` 权限，并绑定 `github-pages` environment。
4. 推送到默认分支 `main` 后自动部署。

关键配置：

- 项目站点地址为 `https://qweeqw231.github.io/micro-subway/`，需要在 Vite 中设置 `base: '/micro-subway/'`，否则静态资源路径会 404。
- 构建产物目录按实际配置填写，默认是 `dist`。
- 只有确定自定义域名后才添加 `CNAME`，不要在仓库中预放占位域名。
- 部署成功前，README 的试玩链接保持“尚未提供”，不要提前写 Pages 地址。

不推荐：手动把 `dist/` 推到 `gh-pages` 分支。产物进入版本历史，容易与源码不一致。

## 4. Discussions

**建议：开启。**

理由：项目处于设计阶段，很多反馈是开放式的（规则是否清楚、周节奏是否合理、地图难度是否合适），不适合全部塞进 Issue。Issues 保留给可执行的缺陷与具体任务。

建议分类：

- `General`：整体设计与方向讨论
- `Ideas`：玩法、升级、地图建议
- `Q&A`：开发与试玩问答

如果暂时没有精力维护，也可以先不开启，等 Web 可试玩后再开。但不要在 README 中宣称已有 Discussions；当前 `CONTRIBUTING.md` 用的是英文表述 “if it is enabled”，两种状态都适用。

## 5. 首次 commit

本次首次提交将基础授权、仓库门面文档与设计基线合并为一个 commit，避免公开仓库出现空链或缺少授权说明的中间状态。

- 文件：`.gitignore`、`LICENSE`、`LICENSE-ASSETS`、`README.md`、`README.zh-CN.md`、`CONTRIBUTING.md`、`2026-11-03/game-design/`、`2026-11-03/opensource-package/`
- commit message：`docs: add Linevale GDD v0.1 and open-source repo files`
- 不进入本次提交：`src/`（另一路仍在开发）、`node_modules/`、`dist/`、构建产物、日志、`.screenshots/`。
- 代码脚手架可运行后单独提交，建议信息：`feat: scaffold web client`。

## 6. 其他仓库设置

- 默认分支使用 `main`。
- 开启 Issues。
- Wiki 暂不需要；设计文档已经在仓库内。
- Releases 暂不创建，等有可分发构建后再建。
- GitHub 的 License 识别只会读取 `LICENSE`，因此会显示 MIT。请在 README 中保持 `LICENSE-ASSETS` 的可见入口，并在 About 文案里保留 `non-commercial`，避免读者误以为素材也是 MIT。
- Dependabot、分支保护、Actions 权限收紧等，等有协作者与依赖后再配置。
- 远程仓库地址为 https://github.com/qweeqw231/micro-subway；About description 与 topics 可直接在 GitHub 仓库设置中填写，文案见第 1、2 节。

### README 徽章链接（可选）

如需在 README 标题下加入静态徽章，可使用以下写法：

```markdown
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/qweeqw231/micro-subway/blob/main/LICENSE)
[![Assets: CC BY-NC-SA 4.0](https://img.shields.io/badge/Assets-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://github.com/qweeqw231/micro-subway/blob/main/LICENSE-ASSETS)
[![Status: early design](https://img.shields.io/badge/status-early%20design-orange.svg)](https://github.com/qweeqw231/micro-subway#status)
```

- 只使用静态事实（许可证与项目状态），不要加入 star、fork、下载量等会随数据变化的徽章。
- 徽章依赖 shields.io 外部图片；若在意第三方请求，可以不加。

### 常用 gh 命令示例

以下命令仅作参考，本次交付不会自动执行。若本机未安装 `gh`，可直接在 GitHub 网页完成对应设置。

```powershell
# 查看仓库
gh repo view qweeqw231/micro-subway --web

# 设置 About description（文案见第 1 节）
$desc = "Linevale (线城; repo: micro-subway) is a from-scratch, non-commercial transit line-planning game: draw metro lines, dispatch trains, carry passengers, pick weekly upgrades, and keep the network running until it jams. Web first, Windows desktop planned. Early design stage — no playable build yet. Not affiliated with Mini Metro."
gh repo edit qweeqw231/micro-subway --description $desc

# Pages 部署成功后设置 Website
gh repo edit qweeqw231/micro-subway --homepage "https://qweeqw231.github.io/micro-subway/"

# 批量添加 Topics
$topics = @("linevale","game","web-game","browser-game","metro","transit","line-planning","typescript","react","canvas","canvas2d","vite","tauri","local-first","save-export","game-design","mit-license","non-commercial")
$topics | ForEach-Object { gh repo edit qweeqw231/micro-subway --add-topic $_ }

# 开启 Discussions
gh api -X PATCH repos/qweeqw231/micro-subway -F has_discussions=true

# 有构建后再开启 Pages（Source = GitHub Actions）
gh api -X POST repos/qweeqw231/micro-subway/pages -F build_type=workflow
```

## 7. 发布前核对

- [ ] `LICENSE` 与 `LICENSE-ASSETS` 的版权持有人为 qweeqw231，年份为 2026，MIT 全文保留。
- [ ] `LICENSE-ASSETS` 的 Source 链接指向 https://github.com/qweeqw231/micro-subway。
- [ ] README 与中文 README 中的试玩链接仍是占位状态，没有假地址。
- [ ] 没有编造截图、star 数、下载量或“已支持”功能。
- [ ] About description 不超过 350 字符（本文两版分别为 326 与 134），且已填入 GitHub 仓库设置。
- [ ] Topics 已填入 GitHub 仓库设置（见第 2 节）。
- [ ] Pages 只在构建存在且部署成功后，将 Website 设为 https://qweeqw231.github.io/micro-subway/。
- [ ] 确认 `.gitignore` 已覆盖 `node_modules/`、`dist/`、构建产物、日志、`.screenshots/` 与 Tauri `src-tauri/target/`。
- [ ] 确认 `README` 与 `README.zh-CN.md` 的设计文档相对链接可打开。
- [ ] 若 README 使用徽章，链接分别指向真实仓库的 `LICENSE`、`LICENSE-ASSETS` 与 `#status` 锚点。
