# 线城 / Linevale MVP Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: use `executing-plans` to implement this plan task-by-task. Steps use `- [ ]` syntax for tracking.

**Goal:** 先交付一个能在浏览器里跑通核心手感的 Web 最小闭环：画一条线、列车运行、乘客生成/上车/送达、站点超载失败；再按 GDD 扩展到三图、存档、完整规则与 Windows 桌面。

**Architecture:** `game/` 是纯 TypeScript 模拟内核（无 DOM、无平台 IO），`render/` 只读状态并用 Canvas 2D 绘制，`ui/` 用 React 只做 HUD/弹窗，`i18n/` 提供唯一文案来源，`platform/` 在后续步骤接入存档与桌面能力。所有玩法数值从 GDD 的 `params.v0.1.json` 直接导入，不在代码里另写一套。

**Tech Stack:** TypeScript 5 + Vite 6 + React 18 + Canvas 2D + Vitest；后续 Web 静态部署，阶段二 Tauri 2。

---

## 0. 固定约束

- 仓库：`https://github.com/qweeqw231/micro-subway`，slug 保持 `micro-subway`；对外名「线城 / Linevale」。
- 当前工作目录：`c:\Work\trae_project\micro-subway`。
- **不要修改**根目录的 `README.md`、`README.zh-CN.md`、`LICENSE`、`LICENSE-ASSETS`、`CONTRIBUTING.md`、`.gitignore`。
- **不要执行** `git init`、`git commit`、`git push`。
- 允许新增根目录的 `package.json`、`index.html`、`tsconfig.json`、`vite.config.ts` 等实现文件。
- 数值唯一来源：`2026-11-03/game-design/outputs/params.v0.1.json`；`src/game/params.ts` 直接导入它，不复制数值。
- i18n 硬约束：所有玩家可见文案来自 `src/i18n/ui-strings.zh-CN.json`；`src/ui`、`src/render`、`src/app` 禁止中文字符串字面量。
- 版本变更只追加仓库根目录 `CHANGELOG.md`（Keep a Changelog + SemVer，分类“新增 / 变更 / 修复 / 移除”）；不新建、不覆盖，文件由另一路创建。
- 第 1 步明确不做：三张正式地图、存档、教程、升级卡、周循环、多线路换乘、美术打磨、桌面版。

## 1. 里程碑、依赖与并行

| 里程碑 | 内容 | 依赖 | 可并行 | 验收标准 |
|---|---|---|---|---|
| M0 | GDD 定稿 + 参数文件 | 无 | 无 | 10 项决策已定稿；i18n 约束已写入 GDD |
| **M1（已完成）** | 脚手架 + 最小可玩闭环 | M0 | i18n 字典、渲染主题、单元测试可并行 | `npm run dev` 可玩：画线、列车、乘客、超载失败 |
| **M2（已完成）** | 完整核心规则：多线路、端点编辑、施工、方向寻路、换乘、超载计时 | M1 | M2A 线路编辑 / M2B 寻路可并行（先冻结类型接口） | 施工可完成；换乘路由可达；浏览器两线共享站 |
| **M3（已完成）** | 内容：三张地图、新站激活、周结算、7 类升级、教程 T0–T5 | M2 | M3A 地图数据 / M3B 教程可并行 | 三图可玩到第 8 周；教程可独立完成 |
| **M4（已完成）** | 存档与设置：3 槽、自动存档、导出/导入、迁移、i18n 全覆盖 | M1 的 i18n；M2 的状态结构 | 可与 M3 并行 | 真实导出→清空→导入继续；零中文硬编码 |
| M5 | Web RC：性能、触控、兼容性、无障碍、静态部署、G1–G4 | M2/M3/M4 | 兼容性 / 性能可并行 | G1–G4 全过；可公开试玩 |
| M6 | Windows 桌面：Tauri 2、真实文件存档、打包、互读、G5 | M5 的 G1–G5 | 与 P1 内容可并行 | 干净 Win10/11 可安装；两端存档互读 |

**M1–M4 已完成；M5 待开工。** M5/M6 的任务在本计划中给出文件边界与验收标准，进入下一阶段时再展开为可执行步骤。

## 2. 目标文件结构（M1 子集）

```text
micro-subway/
├─ package.json                 # 新增，允许
├─ index.html                   # 新增，允许
├─ tsconfig.json                # 新增，允许
├─ vite.config.ts               # 新增，允许
├─ src/
│  ├─ game/                     # 纯模拟：无 DOM / localStorage / 平台 API
│  │  ├─ params.ts              # 直接导入 GDD params.v0.1.json
│  │  ├─ types.ts               # Station / Line / Train / Passenger / SimState
│  │  ├─ rng.ts                 # sfc32
│  │  ├─ demo-map.ts            # M1 临时单图数据，不替代正式三图
│  │  └─ simulation.ts          # tick、spawn、train、boarding、overload
│  ├─ render/
│  │  ├─ theme.ts               # 色板/尺寸常量（非玩法数值）
│  │  └─ renderer.ts            # Canvas 2D 分层绘制
│  ├─ i18n/
│  │  ├─ index.ts               # t(key, vars)，缺 key 抛错
│  │  └─ ui-strings.zh-CN.json
│  ├─ ui/
│  │  ├─ Hud.tsx
│  │  └─ FailurePanel.tsx
│  ├─ app/
│  │  └─ App.tsx                # 画布、指针输入、rAF 循环、HUD 快照
│  ├─ main.tsx
│  └─ styles.css
├─ tests/
│  ├─ simulation.test.ts
│  └─ i18n.test.ts
```

后续 M2+ 再增加 `game/systems/`、`game/maps/`、`game/save/`、`platform/`、`ui/` 完整组件；M1 不预先创建空文件。

## 3. Task 1（当前）：M1 脚手架与最小可玩闭环

**Status:** 已完成（2026-11-04）。`npm test`、`npm run build`、浏览器画线与送达验证均通过；超载失败由单元测试覆盖。

**Files to create:** `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/styles.css`, `src/game/params.ts`, `src/game/types.ts`, `src/game/rng.ts`, `src/game/demo-map.ts`, `src/game/simulation.ts`, `src/render/theme.ts`, `src/render/renderer.ts`, `src/i18n/index.ts`, `src/i18n/ui-strings.zh-CN.json`, `src/ui/Hud.tsx`, `src/ui/FailurePanel.tsx`, `src/app/App.tsx`, `tests/simulation.test.ts`, `tests/i18n.test.ts`.

**Dependencies:** Node 22 + npm 10（已确认）；不需要美术、音频、地图资源。

### Step 1.1：脚手架

- [ ] 创建 `package.json`：`private: true`、`name: "linevale"`，脚本 `dev` / `build` / `test`。
- [ ] 创建 `vite.config.ts`（React 插件）与 `tsconfig.json`（`strict`、`resolveJsonModule`）。
- [ ] 创建 `index.html`、`src/main.tsx`、`src/styles.css`。
- [ ] `npm install`。
- **验收：** `npm run dev` 启动；浏览器显示「线城 / Linevale」标题，无控制台错误。

### Step 1.2：参数与 i18n

- [ ] `src/game/params.ts` 直接 `import raw from "../../2026-11-03/game-design/outputs/params.v0.1.json"`，导出强类型 `params`。
- [ ] `src/i18n/ui-strings.zh-CN.json` 建立 `app` / `hud` / `hint` / `failure` / `common` 分组。
- [ ] `src/i18n/index.ts` 实现 `t(key, vars)`；缺失 key 在开发模式抛错，禁止静默回退。
- [ ] `tests/i18n.test.ts`：扫描 `src/ui`、`src/render`、`src/app`，发现中文字符串字面量即失败；检查所有 `t("...")` key 存在。
- **验收：** `npm test` 通过；改一个 key 为不存在时测试/运行报错。

### Step 1.3：纯模拟内核

- [ ] `types.ts` 定义站点、线路、列车、乘客、状态；站点类型 `residential | work | commercial | leisure`。
- [ ] `rng.ts` 用 sfc32；种子固定，保证重复运行可复现。
- [ ] `demo-map.ts` 放 6 个演示站（3 居住 / 1 工作 / 1 商业 / 1 休闲），坐标在 1280×800 内；M1 只有一条线。
- [ ] `simulation.ts` 实现：
  - 固定 tick（从 `params.time.tickHz` 取）。
  - 线路为空时不生成乘客；线建成后，仅已接入站点生成。
  - 生成率从 `params.demand.baseRatePerStation × 地图系数 × 时段倍率 × 起点类型权重` 计算；目的地按权重选类型，且必须在线路上有可达站。
  - 乘客只上“下一站方向朝向目标站”的车；列车按 `speedPxPerSec` 行驶，端点折返，停站 `dwellBaseSec + dwellPerPassengerSec × 人数`。
  - 容量从 `params.trains.capacity`；队列从 `params.stations.capacity`；超载用 `params.stations.overloadGraceSec` 与 `decayRate`。
  - 站点队列 > 容量累计到宽限 → `failed = true`，暂停。
  - 不实现换乘、施工、周循环（M2/M3 补）。
- [ ] `tests/simulation.test.ts`：至少覆盖建线后列车存在、列车沿线路推进、乘客目标类型合法、超载累计到失败。
- **验收：** `npm test` 通过；不改任何数值，调大 `params.stations.overloadGraceSec` 后测试行为跟着变。

### Step 1.4：渲染、输入与 HUD

- [ ] `theme.ts` 使用 GDD 浅色色板与 6 色线路；`renderer.ts` 绘制地面、站点形状、线路、列车、乘客 token、队列弧、超载环。
- [ ] `App.tsx` 用 Canvas + Pointer Events：
  - 从站点拖到另一站点，建立/延伸单条线；松手在站点上才生效。
  - 线路 ≥2 站时自动生成 1 列车。
  - 支持暂停/继续、重开。
  - 用 rAF + 累加器固定步长推进；HUD 10Hz 刷新，不每帧 setState。
- [ ] `Hud.tsx` 显示周/日（M1 仅第 1 周）、已送达、队列最高值、暂停按钮；`FailurePanel.tsx` 显示失败原因与重开。
- [ ] 所有玩家可见文案通过 `t()`；Canvas 内不画中文，失败/提示全在 DOM。
- **验收：** 浏览器手测：画线 → 列车动 → 乘客上车 → 送达计数增加；故意不接新站，队列满后约 18 秒失败并弹面板。

### Step 1.5：构建与运行验证

- [ ] `npm test` 通过。
- [ ] `npm run build` 通过。
- [ ] `npm run dev` 启动，手动完成一次完整闭环。
- [ ] 记录实际启动命令与端口；若端口被占用，Vite 自动换端口。
- **验收：** 控制台无红色错误；刷新页面能重开（M1 不做存档，刷新即新局）。

## 4. Task 2（已完成）：M2 完整核心规则

**Status:** 已完成（2026-11-04，含 M2.5 修正）。`npm test` 16 passed、`npm run build` passed；浏览器已验证两线共享站、改接、删线、完整换乘链与自然超载到失败。M2.5：重算阈值 8%、候车与车上乘客重算、删线乘客落到原站序下一站、列车按原方向接新站序。

**实际文件:** `src/game/routing.ts`（方向状态、Dijkstra、换乘/等待/拥堵）、`src/game/simulation.ts`（多线路、施工、列车、乘客）、`src/game/types.ts`、`src/render/renderer.ts`、`src/app/App.tsx`、`src/ui/LineDock.tsx`、`src/i18n/ui-strings.zh-CN.json`。

- [x] 起始 2 条线路槽、颜色、两端追加/移除、末端一步改接；删除线路会移除该线列车。车厢与待分配列车池未做（M3）。
- [x] 施工 1.5–6 秒；施工期间不接客；列车按旧线运行；结束切换站序并回位列车。
- [x] 寻路状态含方向、最多 3 次换乘、期望等待、换乘惩罚、拥堵附加；8% 重算阈值同时服务候车与车上乘客，路线缓存只在网络变化时失效。
- [x] 多线路换乘、共享站台容量、反向上车校验、施工中线路不参与寻路。
- [x] `tests/simulation.test.ts` 覆盖建线/施工/运行/送达/超载/换乘/编辑/重算/删线落客/站序回接；浏览器验证两线共享站、改接、删线、自然超载失败。
- [x] M2.5：删线时车上乘客落到原站序下一站；列车被吸到最近站改为沿原行驶方向找下一存在站点，不按欧氏距离乱跳。

**GDD/计划偏差记录（GDD 优先，未覆盖处留待后续）：**

- 起始只开 2 条线路（`lines.startUnlocked=2`）；第 3 条与每周解锁在 M3。计划里“2–6 条”在 M2 只覆盖 2 条。
- 一步“改接”只提供末端；起点改接需先移除再追加；两端追加/移除可用。
- 删除线路完成时把车上乘客放到原站序的下一站队列，不做“列车驶到下一站再清客”的演出；该线列车直接移除，未回收至待分配池。
- 10% 成本内优先少换乘的 tie-break 未实现；当前按最小广义时间选路。
- 单车/线；车厢、待分配列车池、枢纽、周循环在 M3。
- 20% 阈值已按 M2.5 改成 8%；但“最优路径明显变短”仍用估算剩余成本（乘车 + 换乘等待/惩罚），不含列车实时位置，可能与真实到达时间有小偏差。
- 原计划的 `game/systems/*` 拆分未采用，逻辑集中在 `routing.ts` + `simulation.ts`，减少 M2 文件跳转成本。

## 5. Task 3（已完成）：M3 内容

**Status:** 已完成（2026-11-04）。`npm test` 19 passed、`npm run build` passed；三图开局、周结算、升级卡与教程引导已浏览器实测并保存截图。

**实际文件:** `src/game/maps/*`（三图数据与轮廓/水域/站点激活周）、`src/game/map-utils.ts`（跨水段计数）、`src/game/simulation.ts`（周循环、升级、桥隧、站点激活）、`src/ui/MapPicker.tsx`、`WeeklyModal.tsx`、`TutorialTip.tsx`、`LineDock.tsx`。

- [x] 三张原创抽象地图：潮汐湾（海湾/24s/2 桥隧）、棋盘旧城（运河/18s/1 桥隧）、三河岛（双河/15s/2 桥隧）；站点按 `appearWeek` 激活。
- [x] 140 秒/周；周结算分“本周统计”和“升级卡”两步；普通周 2 选 1，第 4/8/12 周 3 选 1。
- [x] 7 类卡：新列车、加挂车厢、新线路、桥隧工程、站台扩建、全线提速、超载宽限；权重与上限进 params。
- [x] 教程 T0–T5：T0 开局暂停直到第一条线建成；后续形状、队列、周结算、新站、超载提示。
- [x] 浏览器实测：三图开局、棋盘周结算、升级卡、教程首线与跨水桥隧；截图在 `outputs/screenshots/`。

**GDD/计划偏差记录：**

- M3 初版升级卡自动选线/选站；M4 已补成“默认推荐 + 玩家可改”。
- M3 未实现“枢纽改造”卡；GDD 的 7 类卡以桥隧、站台扩建、提速、宽限替代。
- 教程提示按事件自动推进，未做“重播教程”设置；教程只覆盖前两周。
- 地图目标/奖牌不在 M3，按计划留到 P1。
- 删线“列车驶到下一站清客”已实现：列车到达下一站才移除，乘客落在该站；线路槽显示“清客中”。

## 6. Task 4（已完成）：M4 存档与 i18n 全覆盖

**Status:** 已完成（2026-11-04，含难度结构修正）。`npm test` 24 passed、`npm run build` passed；浏览器完成真实导出→清空→导入→继续。

**实际文件:** `src/game/save/schema.ts`、`src/platform/types.ts`、`src/platform/web/storage.ts`、`src/ui/SavePanel.tsx`、`src/ui/WeeklyModal.tsx`（目标选择）、`src/app/App.tsx`（存档/目标/桥隧预览）、`src/game/simulation.ts`（快照/每线提速/目标应用）。

- [x] `SaveFileV1`、`linevale-save-slot{slot}-v{schemaVersion}.json`、3 槽、15 秒自动存档。
- [x] Web localStorage、手动保存/读取、下载导出、文件导入、导入前备份。
- [x] 快照包含线网、列车、站点队列、周状态、RNG、加速/宽限/桥隧/线路槽。
- [x] i18n 扫描扩到 `src/**` 全源码；缺失值回退 key；英文键位保持稳定。
- [x] 升级目标可改：列车/车厢/提速选线路，站台扩建选 2 站；默认推荐预选。
- [x] 跨水预览：拖动时 HUD 提示跨水段与桥隧额度，预览线变色。
- [x] 浏览器实测：两线存档→导出→清空 localStorage→导入→时钟从 13:16 走到 19:16，线网恢复；截图已保存。
- [x] 长跑修正：旧结论（第 14 周存活）作废，因为未接入新站不生成乘客。修复后同一两条短线在**第 2 周 s7 失败**（送达 37、峰值 9），证明未接入站点会真实施压。
- [x] 站点容量确认：初始 `params.stations.capacity=6`；站台扩建每次 +2、上限 14；旧长跑的 10 是两次扩建结果，不是参数读错；有单测覆盖。

**M4 偏差记录：**

- 存档一致性只做了真实往返 1 次 + 单元 JSON round-trip；未跑 100 次 fuzz。
- 导入备份是 localStorage 备份键，不是额外导出备份文件。
- 桌面真实文件适配留到 M6；英文翻译值未填，只保留稳定键与回退。
- 修复了“未接入线路的已激活站点不生成乘客”的难度漏洞；现在未接入站会排队并可能超载。旧的长跑“第 14 周存活”结论已废弃。
- 尚未用完整 17 站接通的网络重跑后期长跑；当前只验证了“不接新站会在第 2 周失败”。
- 提速改为单线目标，GDD 卡表已同步。

## 7. Task 5（下一阶段）：M5 Web RC

- [ ] 性能：17 站、6 线、24 列车、200 token，2× ≥55 FPS。
- [ ] 触控真机、1024×640、Chrome/Edge/Firefox。
- [ ] 失败/周结算/存档面板的 i18n、键盘暂停、减少动态。
- [ ] 静态部署；G1–G4 验收；不修改受保护根文件。
- **依赖：** M2/M3/M4 全部完成。

## 8. Task 6（阶段二）：M6 Windows 桌面

- [ ] 先做 Tauri 2 空壳 spike：能启动、能读写一个测试存档。
- [ ] 新增 `src/platform/desktop/*`、`src/main.desktop.ts`、`src-tauri/`；不改 `game/`、`render/`、`ui/`。
- [ ] 桌面存档路径 `%APPDATA%\Linevale\saves\...`；与 Web 存档互读。
- [ ] 安装/卸载/更新测试；G5 全过。
- **依赖：** M5 的 G1–G5。**不要求 M3 全部内容先完成**，以当时 Web 稳定版为基线。

## 9. M1 验收清单

- [ ] `npm install` 成功。
- [ ] `npm run dev` 打开浏览器可玩。
- [ ] 能画一条线（至少 2 站），线路可见。
- [ ] 列车沿线路往返，停站有上下客。
- [ ] 乘客生成、上车、到目的地类型站点后送达计数增加。
- [ ] 站点队列超过容量并持续宽限 → 失败面板出现。
- [ ] 所有玩法数值来自 `params.v0.1.json`；`rg "0\\.05|55|18" src/game` 不出现硬编码玩法数字。
- [ ] `npm test` 通过；i18n 扫描零中文硬编码。
- [ ] `npm run build` 通过。
- [ ] 未修改任何受保护根文件，未执行 git 写操作。

## 10. 风险与决策

| 风险 | 处理 |
|---|---|
| 直接导入 docs 下的 params JSON 可能被 Vite 视为外部文件 | 文件在仓库根内；若构建报错，改用 `src/game/params.v0.1.json` 同步副本并在 README 标注唯一来源 |
| M1 单线路无法验证换乘 | 明确 M2 范围；M1 只验收“单线闭环”，不假装支持换乘 |
| 18 秒宽限在演示图太慢 | 用 params 直接调；M1 可把演示图宽限调小做手测，但提交值必须回到 params 文件 |
| UI 中文硬编码 | i18n 扫描测试从 M1 就开始；新增文案必须先加 key |
| 受保护根文件被误改 | 每次结束检查 `git status`（只读命令）或文件时间；不写 README/LICENSE |
