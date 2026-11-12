<div align="center">

  <p>
    <a href="https://github.com/wreckglow/source-i18n/blob/main/README.md">English</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/zh-CN.md"><strong>简体中文</strong></a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ja-JP.md">日本語</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ko-KR.md">한국어</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/es-ES.md">Español</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/fr-FR.md">Français</a>
  </p>

  <img src="assets/logo.svg" width="64" height="64" alt="source-i18n" />

  <h1>source-i18n</h1>

  <p>
    <strong>前端项目的自动翻译工具。</strong><br />
    写界面文案，发布所有语言。
  </p>

  <p>
    <a href="https://www.npmjs.com/package/source-i18n"><img src="https://img.shields.io/npm/v/source-i18n?style=flat-square&color=e04a22" alt="npm" /></a>
    <img src="https://img.shields.io/badge/tests-209%20passing-2ea44f?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-141412?style=flat-square" alt="node" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-141412?style=flat-square" alt="license" /></a>
  </p>

  <p>
    <a href="#快速开始">快速开始</a> &nbsp;·&nbsp;
    <a href="#特性">特性</a> &nbsp;·&nbsp;
    <a href="#文档">文档</a> &nbsp;·&nbsp;
    <a href="#ai">AI</a>
  </p>
</div>

<p align="center">
  <a href="https://sourcei18n.deploybrain.cn/cn">官网</a> &nbsp;·&nbsp;
  <a href="https://github.com/wreckglow/source-i18n">GitHub</a>
</p>

<img src="assets/hero.jpg" alt="source-i18n — 写界面文案，发布所有语言" />

## 这是什么

source-i18n 是给前端项目用的自动翻译工具。界面照常写中文或英文，构建时自动生成英、日、韩、西、法等语言版本；不用给每句话起 key，也不用维护语言包和导出表。

适用：官网、后台管理系统、SaaS、Electron 桌面应用；React、Vue、Svelte 和原生 HTML 都能接。

## 理念

翻译 key 是团队要额外维护的第二套语言。

`save_project_button_confirm` 不是文案。它是某个人发明的名字，被复制到十几个文件里，永远和用户真正读到的文字分离。

**source-i18n 去掉 key 这一层。** 源文就是 key。

```tsx
// 之前
t('save_project_button_confirm')

// 之后
t('保存项目')
```

不用起 key，也不用导出文件。同一句源文，构建后就是五种译文：

| 你写 | en-US | ja-JP | ko-KR | es-ES | fr-FR |
|---|---|---|---|---|---|
| `t('保存项目')` | Save project | プロジェクトを保存 | 프로젝트 저장 | Guardar proyecto | Enregistrer le projet |

构建时每个 `t()` 调用都会被抽取，通过你选择的服务商翻译，并作为语言包注入。人工修改会被保留。缺失的文案会让 CI 失败，而不是让用户看到 fallback。

## 特性

| 能力 | 你会得到 |
|---|---|
| **不用命名 key** | 你写的文字就是标识符，不用发明、重命名或维护文档。 |
| **构建时抽取** | 每个 `t()` / `$t()` 调用自动成为一条词条。 |
| **服务商自由** | OpenAI 兼容接口、DeepL、Ollama、手动模式，或你自己的 provider 对象。 |
| **人工修改优先** | 机器输出会记录指纹。你改过的译文，`sync --force` 也不会覆盖。 |
| **翻译记忆** | 源文改名后，原有译文会跟着迁移。 |
| **支持 ICU** | 占位符、复数、数字格式化，以及用 `context` 区分同词多义。 |
| **CI 门禁** | `check --strict` 拦截缺失文案、损坏的占位符、失效词条和动态调用。 |
| **默认安全** | 生产包只包含语言包：没有服务商密钥、没有开发端点、没有网络请求。 |
| **五种构建器** | Vite、Rollup、esbuild、webpack、rspack。 |
| **五种运行时** | React、Vue、Svelte、原生 DOM，以及 Node/Electron。 |
| **AI 原生** | 内置 MCP server 和可移植的 Agent Skill，不绑定某一个客户端。 |
| **六种语言的文档** | 文档站本身就是用 source-i18n 构建的。 |

## 用起来是什么感觉

```tsx
import { useT } from 'source-i18n/react'

export function Toolbar() {
  const t = useT()

  return (
    <button>{t('保存项目')}</button>
  )
}
```

`source-i18n sync` 之后的语言包：

```json
{
  "locale": "en-US",
  "sourceLocale": "zh-CN",
  "messages": {
    "保存项目": "Save project"
  }
}
```

切换语言：

```ts
import { setLocale } from 'source-i18n'

setLocale('zh-CN')
```

需要接入的 API 就这么多。

## 快速开始

```bash
npm i source-i18n
npx source-i18n init
```

`init` 会创建 `source-i18n.config.mjs` 和 `i18n/locales/`，然后询问你的源语言、目标语言和服务商。

配置文件可以是 `.mjs`、`.js`、`.cjs` 或 `.json`；在 **Node 22.13+** 上也可以是 `.ts` / `.mts`，Node 会在加载时剥离类型（不需要打包器，也不需要额外依赖）。Node 20 请使用 `init` 生成的 `.mjs`。Node 第一次加载 TypeScript 配置时会打印一行 `ExperimentalWarning`，可以忽略。

添加插件：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sourceI18n from 'source-i18n/unplugin/vite'

export default defineConfig({
  plugins: [sourceI18n()],
})
```

构建器适配器是 ESM-only（基于 unplugin 3）：请从 ESM 配置中加载——`vite.config.ts`、`rollup.config.mjs`、`webpack.config.mjs`，或任何位于 `"type": "module"` 包里的配置文件。CommonJS 的 `webpack.config.js` 需要在函数式配置中 `await import('source-i18n/unplugin/webpack')`。运行时本身是双格式的：`source-i18n`、`/react`、`/vue`、`/svelte`、`/vanilla`、`/node` 都同时支持 `import` 和 `require`。

写：

```tsx
<button>{t('保存项目')}</button>
```

运行：

```bash
npm run dev
```

缺失的文案会直接显示在界面上，并在控制台报告。开发时的自动翻译是**可选项**：需要把缺失文案发给服务商时，开启 `dev.autoTranslate`，或者运行：

```bash
npx source-i18n sync
```

## 适配你的技术栈

| 构建器 | UI | 运行时 |
|---|---|---|
| Vite | React 18 / 19 | 浏览器 |
| Rollup | Vue 3 | Node |
| esbuild | Svelte | Electron |
| webpack | 原生 DOM | SSR |
| rspack | | |

运行时很小，并且贴合框架习惯：React 用 hooks，Vue 用 composables，Svelte 用 store，纯 HTML 用 `data-i18n`，Node 适配器用于 CLI 和桌面主进程。

## 服务商

| 服务商 | 适合 |
|---|---|
| **OpenAI 兼容** | 质量与速度：OpenAI、DeepSeek、Moonshot、Groq、OpenRouter，或任何兼容端点。 |
| **DeepL** | 欧洲语言和术语表较重的产品。 |
| **Ollama** | 完全本地翻译，文案不离开你的机器。 |
| **手动** | 只想要抽取和校验。 |
| **自定义** | 你自己的翻译服务，只需实现一个 `translate()` 方法。 |

密钥放在环境变量里——`OPENAI_API_KEY`、`SOURCE_I18N_API_KEY`、`DEEPL_API_KEY` 或 `OLLAMA_HOST`。它们只在 Node 中读取，永远不会进入浏览器。

## CLI

| 命令 | 作用 |
|---|---|
| `source-i18n init` | 创建配置和语言包目录。 |
| `source-i18n extract` | 列出所有会被翻译的文案。只读。 |
| `source-i18n sync` | 补齐缺失翻译并写回语言包。 |
| `source-i18n sync --dry-run` | 只展示将要发生什么。不联网，不写文件。 |
| `source-i18n format` | 规范化语言包；每次提交前跑都安全。 |
| `source-i18n check --strict` | CI 门禁：缺失、非法、失效、动态调用。 |
| `source-i18n skill --dir .claude/skills` | 把可移植的 Agent Skill 安装到某个客户端目录。 |

`sync` 永远不会覆盖人工修改。`--prune` 只删除源文已消失的机器词条，`--prune-manual` 需要显式开启。

## AI

这个包自带 agent 真正需要的接口。

**MCP server**

```bash
npm i -D source-i18n @modelcontextprotocol/sdk
npx source-i18n-mcp --root /path/to/project
```

工具：`i18n_extract`、`i18n_check`、`i18n_sync`。`sync` 默认 dry-run，只有显式确认才会写文件。资源会暴露脱敏后的配置和语言包。

**Agent Skill（可移植）**

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

Skill 遵循 Agent Skills 开放标准，不绑定 Claude Code。`.claude/skills/` 只是某个客户端的安装目录；其他 Agent Skills 客户端会从自己的 skills 路径加载同一个目录。用 `--force` 覆盖已有安装。

## 安全

- 服务商密钥只留在 Node；浏览器产物里只有语言包。
- 生产构建没有开发端点，也没有开发 token。
- 开发端点要求每次会话的 token、同源请求和 JSON。
- MCP 会把 `apiKey`、`token`、`secret`、`password` 字段脱敏。
- `npm publish` 会对所有可发布文件执行密钥扫描。

## 文档

**官网：** [sourcei18n.deploybrain.cn/cn](https://sourcei18n.deploybrain.cn/cn)

<img src="assets/docs.jpg" alt="source-i18n 文档站" />

文档维护在独立站点：15 个页面，覆盖安装配置、核心概念、API、CLI、配置、CI、服务商、示例、排错和 AI 工具。

站点支持六种语言——English、中文、日本語、한국어、Español、Français——带搜索、页内目录和带语言前缀的 URL。

## 取舍

source-i18n 是有观点的。它在这些情况下很合适：

- 团队直接在产品里写文案；
- 你希望翻译发生在构建阶段，而不是另开一个平台；
- 你更在意尽快上线，而不是维护 key 登记表。

它不适合运行时的用户生成内容、后端错误文案，或需要完整 TMS（译者角色、审批流）的翻译流程。

修改源文会产生一条新的词条——这是“源文即 key”的代价，也是翻译记忆存在的理由。

## 状态

- `209` 个测试，包含真实构建器和真实浏览器
- Node.js `>= 20`
- MIT 许可
- 包：[`source-i18n`](https://www.npmjs.com/package/source-i18n)
- 源码与 issue：[`wreckglow/source-i18n`](https://github.com/wreckglow/source-i18n)
- 联系：[wreckglow@gmail.com](mailto:wreckglow@gmail.com)

## 免责声明

source-i18n 按“现状”提供，不附带任何担保；详见 [LICENSE](./LICENSE)。

- 机器翻译来自第三方服务，可能出错。上线前请审校语言包；维护者不对翻译错误、遗漏及其后果负责。
- 你选择翻译的源文本会发送给所配置的服务商（OpenAI 兼容接口、DeepL、Ollama、你自己的 provider，或 MCP 客户端背后的模型）。这些数据和 API 费用由你与服务商约定。
- 在医疗、法律、安全、金融或受监管内容等错误渲染可能造成伤害的场景，不要在没有人工复核的情况下依赖机器翻译。

## 许可证

MIT © source-i18n contributors

<br />

<div align="center">
  <sub>写界面文案，发布所有语言。</sub>
</div>
