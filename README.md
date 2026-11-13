# FeedbackProof

[English](#english) | [中文](#中文)

---

## English

Your AI coding agent just replied: *"All 12 review comments addressed."* Did it actually fix them, or did it just say so? **FeedbackProof reconciles the agent's fix claims against the actual follow-up diff — item by item, deterministically, with zero LLM calls.**

It sits at the downstream end of the human→agent feedback loop that tools like plan annotators and hybrid code reviewers create: they get feedback *to* the agent; FeedbackProof verifies what came *back*.

### Why

- **Phantom fixes are the norm, not the exception.** An agent that claims "fixed" while the diff never touched the file is indistinguishable from an honest report — unless you audit claim vs. evidence.
- **Deterministic beats vibes.** Every finding comes from a fixed rule over the parsed diff. Same input, same verdict, no API keys, no model cost.
- **It closes the loop.** Plannotator-class tools deliver feedback; review bots generate comments. Nobody verifies the return trip.

### Features

- **Item ledger** — every feedback item gets a verdict row: claim status, diff evidence (`targeted` / `elsewhere` / `none`), and rule flags.
- **18 deterministic rules across 5 dimensions**:
  - **Coverage** — unaddressed items, fixes that landed outside the target file, skipped-while-nearby-code-moved.
  - **Honesty** — *phantom fixes* (claimed fixed, no matching change), evidence paths that don't exist in the diff, "all done" summaries contradicted by the ledger, reason-free wontfix, silently ignored items.
  - **Targeting** — fixes landing 50+ lines away from the feedback anchor, unrequested scope creep files.
  - **Recurrence** — quoted hazards (`console.log`, secrets) reintroduced in *new* lines elsewhere; removals that were re-added; secret-shaped literals in added lines (env/vault-aware).
  - **Hygiene** — silent fixes, fixed-without-evidence-pointer claims, orphan claim ids, duplicate resolutions.
- **Hard caps** — one phantom fix pins the ceiling at 58; ≥12 errors pin at 40. A single unforgivable signal can't be diluted by a large clean diff.
- **Three calibration fixtures** — `clean-loop` (100/A/pass, zero findings), `sloppy-loop` (62/D), `phantom-loop` (40/F). Pairwise gaps > 15 points.
- **Dual anchor matching** — strong anchors (backtick spans, identifiers, paths) match with token boundaries; weak content words need ≥2 hits, which kills false positives.
- **Zero runtime dependencies** — TypeScript strict, `node:fs`/`node:http` only.
- **Web console** — React SPA with score dial, dimension bars, item ledger and findings list; load a calibration demo and audit in one click.

### Quick start

```bash
# CLI (from a checkout)
npm install && npm run build
node bin/feedbackproof.js demo phantom-loop

# Audit your own loop
node bin/feedbackproof.js audit \
  --feedback feedback.json \
  --claims claims.json \
  --diff fix.patch \
  --format json --fail-on error

# Web console + API
node bin/feedbackproof.js serve --port 8788
# open http://localhost:8788

# Docker
docker compose up --build
```

### Input format

`feedback.json` — what humans flagged:

```json
[
  {"id": "F1", "file": "src/api/orders.ts", "line": 12, "severity": "blocker",
   "text": "Remove the hardcoded API key `sk-live-...` and load it from an env var."}
]
```

`claims.json` — what the agent says it did:

```json
{
  "summary": "All feedback addressed.",
  "items": [
    {"id": "F1", "status": "fixed", "note": "moved to env", "evidence": ["src/api/orders.ts"]}
  ]
}
```

`diff` — the unified diff of the follow-up patch.

Statuses: `fixed | wontfix | deferred | partial`. Severities: `blocker | major | minor`.

### API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | liveness + version |
| POST | `/api/audit` | body `{feedback, claims, diff}` → full audit result |
| GET | `/api/demos` | list calibration fixtures |
| GET | `/api/demo?name=phantom-loop` | audit a bundled fixture |

CLI: `audit`, `demo [name]`, `serve [--port N] [--host H]`, `help`, `version`. Exit codes: `0` clean, `1` findings at/above `--fail-on`, `2` input error.

### Tech stack

- TypeScript 5.7 (strict, `noUncheckedIndexedAccess`), **zero runtime dependencies**
- React 18 + Vite 5 console (build artifacts committed under `static/`)
- Vitest — 94 tests
- Docker: multi-stage `node:22-alpine`, non-root user, read-only rootfs, `cap_drop ALL`

### Score model

Five weighted dimensions (coverage .28, honesty .26, targeting .16, recurrence .16, hygiene .14), each starting at 100 minus decayed rule penalties (repeats ×0.35), then hard caps (`H101`→58, `R101`→68, blocker `C101`→62, ≥4 errors→65, ≥8→52, ≥12→40). Grade: A ≥90, B ≥80, C ≥70, D ≥60, else F. Verdict fails on any error or score < 60.

### License

MIT

---

## 中文

你的 AI 编码 Agent 刚刚回复：「12 条评审意见已全部修复」。它真的修了吗，还是只是这么说？**FeedbackProof 把 Agent 的修复声明和实际的后续 diff 逐条对账——确定性规则，零 LLM 调用。**

它位于「人类 → Agent」反馈回路的下游终点：plannotator 一类的工具负责把反馈**送达到** Agent，代码评审机器人负责**产生**意见，但没有人验证**回程**——FeedbackProof 补上这一环。

### 为什么做

- **「幻觉式已修复」是常态而非例外。** Agent 声称「已修复」但 diff 根本没碰那个文件——不做「声明 vs 证据」对账，你完全分辨不出来。
- **确定性胜过感觉。** 每条 finding 都来自对解析后 diff 的固定规则。同样输入永远同样结论，不需要 API key，不烧 token。
- **闭环缺的就是这一半。** 反馈发送、意见生成都有人做，回程验证是真空。

### 功能

- **逐条台账（Item Ledger）**——每条反馈一行结论：声明状态、diff 证据（`targeted` / `elsewhere` / `none`）、命中的规则。
- **5 维 18 条确定性规则**：
  - **覆盖（Coverage）**——未处理的条目、修到了别的文件、旁边的代码动了但这条被跳过。
  - **诚实（Honesty）**——**幻影修复**（声称已修复但 diff 无任何匹配）、证据路径不在 diff 里、「全部完成」式总结与台账矛盾、没有理由的 wontfix、被静默忽略的条目。
  - **定位（Targeting）**——修复落在反馈锚点 50 行之外、没人要求的「顺手改动」文件。
  - **复发（Recurrence）**——反馈引用的危害模式（`console.log`、密钥）在**新增行**里再次出现；要求删除的东西被加了回来；新增行中的密钥形态字面量（识别 env/vault 写法，不误报）。
  - **卫生（Hygiene）**——无声明修复、声称修复却无证据指针、孤儿声明 id、重复结论。
- **硬封顶**——一条幻影修复直接把分数压到 58 封顶；≥12 条 error 压到 40。单一不可原谅信号不会被大片干净 diff 稀释。
- **三份标定 fixture**——`clean-loop`（100/A/pass，零 finding）、`sloppy-loop`（62/D）、`phantom-loop`（40/F），两两差距 > 15 分。
- **双锚点匹配**——强锚点（反引号片段、标识符、路径）按词元边界匹配；弱内容词需要 ≥2 次命中，显著压低误报。
- **零运行时依赖**——TypeScript strict，只用 `node:fs` / `node:http`。
- **Web 控制台**——React SPA：分数表盘、维度条、逐条台账、findings 列表；一键加载标定 demo 并审计。

### 快速开始

```bash
# CLI（仓库内）
npm install && npm run build
node bin/feedbackproof.js demo phantom-loop

# 审计你自己的回路
node bin/feedbackproof.js audit \
  --feedback feedback.json \
  --claims claims.json \
  --diff fix.patch \
  --format json --fail-on error

# Web 控制台 + API
node bin/feedbackproof.js serve --port 8788
# 打开 http://localhost:8788

# Docker
docker compose up --build
```

### 输入格式

`feedback.json`——人类批注了什么：

```json
[
  {"id": "F1", "file": "src/api/orders.ts", "line": 12, "severity": "blocker",
   "text": "删掉硬编码的 API 密钥 `sk-live-...`，改成从环境变量读取。"}
]
```

`claims.json`——Agent 声称做了什么：

```json
{
  "summary": "全部反馈已处理。",
  "items": [
    {"id": "F1", "status": "fixed", "note": "已改为环境变量", "evidence": ["src/api/orders.ts"]}
  ]
}
```

`diff`——后续补丁的 unified diff。

状态：`fixed | wontfix | deferred | partial`；严重度：`blocker | major | minor`。

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活检查 + 版本 |
| POST | `/api/audit` | body `{feedback, claims, diff}` → 完整审计结果 |
| GET | `/api/demos` | 列出标定 fixtures |
| GET | `/api/demo?name=phantom-loop` | 审计内置 fixture |

CLI：`audit`、`demo [name]`、`serve [--port N] [--host H]`、`help`、`version`。退出码：`0` 干净，`1` 有达到 `--fail-on` 阈值的 finding，`2` 输入错误。

### 技术栈

- TypeScript 5.7（strict、`noUncheckedIndexedAccess`），**零运行时依赖**
- React 18 + Vite 5 控制台（构建产物提交在 `static/`）
- Vitest——94 个测试
- Docker：多阶段 `node:22-alpine`，非 root 用户，只读根文件系统，`cap_drop ALL`

### 评分模型

五个加权维度（coverage .28、honesty .26、targeting .16、recurrence .16、hygiene .14），每个维度从 100 起扣（同规则重复命中 ×0.35 递减），再叠加硬封顶（`H101`→58、`R101`→68、blocker 级 `C101`→62、≥4 error→65、≥8→52、≥12→40）。等级：A ≥90，B ≥80，C ≥70，D ≥60，否则 F。存在 error 或分数 < 60 即 fail。

### License

MIT
