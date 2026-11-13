# Microduck 交接清单 v3（2026-11-13 23:20）

> 副本已补全：`deliver/robotbuddy-page/` **6.1 MB / 40 个文件**，递归引用 0 缺失（Chief 核）；本次用无头浏览器实测可加载。
> 判据串仍在原位：`microduck.html:39`「支持中文 · 本地规则演示」、`:45`「官方双足模型。…」、`:47`「当前任务生成使用本地规则。官方双足模型。…」；`training|walking|turning:23`「MuJoCo · 本地 CPU」。**是同一套。**
> 只出清单，未改代码。

## 0. 一句话结论

**页面本体完整、能加载。** 主工作台是「本地姿态预览 + 本地规则生成 + Blockly」——实测能出积木和 Python、能跑完 4 步；三个训练页前端和 3D 都正常，但**唯一的硬缺口是 `/api/training` 后端**：点了会报错，不会假装在跑。「MuJoCo · 本地 CPU」仍是 hostname 标签（不是运行状态）。

## 1. 代码在哪

| 项 | 内容 |
|---|---|
| 唯一副本 | `deliver/robotbuddy-page/`（6.1 MB / 40 文件） |
| 主工作台 | `microduck.html:3`（`data-arm="microduck"`）→ `app.js` → `program.js` / `scene-teaching-rig.js` / `teaching-rig-model.js` / `rig-profiles.js` / `microduck-workbench-skill.js`（**均在，0 缺失**） |
| 训练页 | `microduck-training|walking|turning.html` → `microduck-training.js` + `microduck-training-scene.js`（均在）+ `training-lesson-store.js` |
| 模型资产 | `models/microduck/`：`microduck.urdf`、`plate.stl`、`octobot.glb`、`meshes.json`、`meshes.bin`、`hand-rig.json`（**到位**） |
| 加载方式 | `rig-profiles.js:118–133` 定义 Microduck（`articulation.file=microduck.urdf`，15 个关节）；`teaching-rig-model.js:63/76` 的 `visuals==='urdf'` 分支自写解析 URDF（不用 GLTFLoader） |
| 源码仓库 | **仍不在本机**（全机搜 `api/training` / `MicroduckStudio` 实现，零命中） |
| 其他机器人页 | `microduck.html:5–35` 菜单里的 `index/fr3/go2/amazinghand/jetrover/octobot/...` 仍缺；不影响 Microduck 四页 |

## 2. 怎么起

| 项 | 结论 |
|---|---|
| 静态服务 | `python3 -m http.server 4173` → **实测 200**，无头 Chrome 能加载（见 §3/§6） |
| 后端 `/api/training` | **缺失**（本机无实现）。实测请求打到 4173 → **501 Unsupported method ('POST')** |
| 端口 4187 | 页面写死的绝对地址（`microduck.html:51–52`、`microduck-training.html:103–104`）；当前未监听 |
| 端口 4173 | `microduck.html:48–52` 内联探测：本地探 `/api/training/0000…`，拿不到 JSON 就把链接改到 4187 |
| 模型文件 | 齐全，不需外网下载 |
| 环境 | 主工作台：浏览器 + 静态服务即可。训练页：还需要 `/api/training` 后端，其环境**未验证** |

## 3. 验收状态（本次实测）

| 项 | 结果 |
|---|---|
| **① 主工作台能加载吗** | **能**。无头 Chrome（chromium-1179 + SwiftShader）打开：`#scene-status` = 「Microduck · 双足与鸭嘴动作预览」，canvas **558×348**，`microduck.urdf` / `meshes.json` / `meshes.bin` 全 **200**，`pageErrors` 空；截图 `research/microduck-shots/microduck-workbench.png` |
| **② generateTask 出什么** | **出真东西**。输入 placeholder 原句「转头，等待 1 秒，再张开鸭嘴，再合上鸭嘴」→ 生成 **5 个积木** + 代码：`robot.pose("look",1)` / `robot.wait(1)` / `robot.pose("open",1)` / `robot.pose("close",1)`；actions 4 条；日志「本地规则已生成教学程序，请审核积木后运行」。点运行后 **4 步全执行**（`current-step`=4·合上鸭嘴，关节 32°/12.6°，鸭嘴「开合中」）。截图 `microduck-run.png` |
| **③ 三个训练页无后端时** | **不假装在跑**：3D 模型仍加载（「模型已就绪」），点「开始训练」→ `POST /api/training` → **501**，页面把原始错误直接抛出来：`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`（因为 `microduck-training.js:52` 先 `response.json()` 再判 ok）。walking / turning 同。截图 `microduck-training.png` |
| **④ URDF 能否被 three.js 加载** | **能**。URDF + meshes 均 200，场景里渲染出鸭子（截图可见双足/鸭嘴/头）；加载器是 `teaching-rig-model.js:63/76` 的 `urdf` 分支（自写解析 + `models/microduck` 网格），不是 URDFLoader 插件 |

**仍成立的三条**（Chief 已核，本次未推翻）：
- 「MuJoCo · 本地 CPU」= hostname 标签（`runtime-status.js:1–9`）；
- 「本地规则演示」属实（`app.js:21` 调 `generateTask`、`app.js:25` 日志）；
- 主工作台「虚拟仿真」= **姿态预览**（`app.js:11` 原文「运动预览完成；尚未进行碰撞及抓取物理验证」，`app.js:16` 只是角度插值）。

## 4. 坑（更新）

1. **唯一硬缺口：`/api/training` 后端**（源码不在本机）。训练页现在的报错是原始 JSON 解析错误，二期后端最好返回 JSON error，前端把 `response.json()` 包进 try/catch。
2. **hostname 标签**：本地打开就显示「MuJoCo · 本地 CPU」，后端没起也一样（`runtime-status.js:1–9`）——显示逻辑，不是能力声明。
3. **主工作台是姿态预览**：无碰撞/抓取物理验证（`app.js:11`）。
4. **多机器人菜单 9+ 页缺失**（`index/fr3/go2/...`），点进去 404；不影响 Microduck 四页。
5. **端口写死**：4187 写死在 `microduck.html:51–52`、`microduck-training.html:103–104`。
6. **Blockly 图标资源缺一份**：`/vendor/media/sprites.png` 404（实测；不影响功能，只是图标）。
7. **主工作台会探测技能接口**：启动即打 `/api/training/skill`、`/skill/stationary`（404），于是显示「步态服务未连接」（`microduck-workbench-skill.js:105`）——这是**如实降级**，不是假运行。
8. **外部依赖只有一个**：`microduck.html:47` 的 HF 外链 `pollen-robotics/microduck-simulator`，只是链接不参与运行。
9. **localStorage 版本键**：`microduck-training-history-v1`、`microduck-{training,walking,turning}-active-v1`（`microduck-training.js:20–21`）、`microduck-custom-lessons-v1`（`training-lesson-store.js:1`）。
10. **契约只在前端**：job 形状按 §5 反推，后端字段对不上会白屏。

## 5. `/api/training` 契约（从 JS 反推，供二期）

| 方法 / 路径 | 请求体 | 返回 |
|---|---|---|
| `POST /api/training` | `{episodes, stepPenalty, goal?|target?, tolerance?}`（看向）或 `{episodes, stepPenalty, task:'short'|'walking'|'turning', angle?, direction?}` | `job` |
| `GET /api/training/:id` | — | `job`（轮询：步态 300 ms、看向 650 ms） |
| `GET /api/training/:id/replays/:stage` | `stage ∈ baseline/early/middle/final` | `replay` 帧数据 |
| `DELETE /api/training/:id` | — | 停止后的 `job` |
| `POST /api/training/skill` 或 `/skill/turning` | `{id}` | 保存技能 |

`job` 字段：`{id, status:'running'|'completed', queuePosition?, settings, history[{episode,best:{passed,total,drift},passed,window,averageMoves}], summary:{final:{passed}}, replays:{baseline,early,middle,final}}`。

## 6. 实测方法与输出

```text
静态服务:  cd deliver/robotbuddy-page && python3 -m http.server 4173
浏览器:    playwright-core + chromium-1179（headless，--use-gl=swiftshader）
主页面:    scene-status=「Microduck · 双足与鸭嘴动作预览」，canvas 558×348，
           assets 200: microduck.urdf / meshes.json / meshes.bin，pageErrors 空
生成:      「转头，等待 1 秒，再张开鸭嘴，再合上鸭嘴」→ 5 积木 + 4 actions + 代码（见 §3②）
运行:      4/4 步完成；日志「运动预览完成；尚未进行碰撞及抓取物理验证」
训练页:    POST /api/training → 501；提示 `Unexpected token '<', "<!DOCTYPE "...`
404 列表:  /vendor/media/sprites.png、/api/training/0000…、/api/training/skill、/api/training/skill/stationary
截图:      research/microduck-shots/{microduck-workbench,microduck-run,microduck-training}.png
```

**未验证**：训练是否真跑 MuJoCo、「从官方步态出发」的行为、`/api/training` 真实实现、4187 原本怎么起、其他机器人页。要确认，需要**源码仓库或完整站点**。
