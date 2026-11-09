<div align="center">

  <p>
    <a href="https://github.com/wreckglow/source-i18n/blob/main/README.md">English</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/zh-CN.md">简体中文</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ja-JP.md">日本語</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ko-KR.md"><strong>한국어</strong></a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/es-ES.md">Español</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/fr-FR.md">Français</a>
  </p>

  <img src="assets/logo.svg" width="64" height="64" alt="source-i18n" />

  <h1>source-i18n</h1>

  <p>
    <strong>키 없는 i18n.</strong><br />
    인터페이스를 쓰고, 모든 언어로 출시하세요.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/source-i18n"><img src="https://img.shields.io/npm/v/source-i18n?style=flat-square&color=e04a22" alt="npm" /></a>
    <img src="https://img.shields.io/badge/tests-209%20passing-2ea44f?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-141412?style=flat-square" alt="node" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-141412?style=flat-square" alt="license" /></a>
  </p>

  <p>
    <a href="#빠른-시작">빠른 시작</a> &nbsp;·&nbsp;
    <a href="#기능">기능</a> &nbsp;·&nbsp;
    <a href="#문서">문서</a> &nbsp;·&nbsp;
    <a href="#ai">AI</a>
  </p>
</div>

<img src="assets/hero.jpg" alt="source-i18n — 인터페이스를 쓰고, 모든 언어로 출시하세요" />

## 아이디어

번역 키는 팀이 하나 더 유지해야 하는 언어입니다.

`save_project_button_confirm`은 문구가 아닙니다. 누군가 만들어낸 이름이고, 수십 개 파일에 복사되며, 사용자가 실제로 읽는 텍스트와 영원히 분리되어 있습니다.

**source-i18n은 키 계층을 없앱니다.** 소스 텍스트가 키입니다.

```tsx
// 변경 전
t('save_project_button_confirm')

// 변경 후
t('Save project')
```

빌드 시 모든 `t()` 호출이 추출되고, 선택한 공급자로 번역되어 카탈로그로 주입됩니다. 사람의 수정은 보존됩니다. 누락된 문자열은 사용자가 아니라 CI를 실패시킵니다.

## 기능

| 기능 | 얻는 것 |
|---|---|
| **키 이름 짓기 불필요** | 작성한 텍스트가 곧 식별자입니다. 만들어내거나, 이름을 바꾸거나, 문서화할 필요가 없습니다. |
| **빌드 시 추출** | 모든 `t()` / `$t()` 호출이 자동으로 카탈로그 항목이 됩니다. |
| **공급자 자유** | OpenAI 호환 API, DeepL, Ollama, 수동, 또는 직접 만든 provider 객체. |
| **사람의 수정 우선** | 기계 출력은 지문으로 기록됩니다. 수정한 번역은 `sync --force`로도 덮어쓰지 않습니다. |
| **번역 메모리** | 소스 문자열 이름을 바꿔도 이전 번역이 따라옵니다. |
| **ICU 지원** | 자리표시자, 복수형, 숫자 서식, 모호한 단어를 위한 `context`. |
| **CI 게이트** | `check --strict`가 누락, 깨진 자리표시자, 오래된 항목, 동적 호출을 막습니다. |
| **기본 안전** | 프로덕션 번들에는 카탈로그만 들어갑니다. 공급자 키도, 개발 엔드포인트도, 네트워크 요청도 없습니다. |
| **다섯 가지 번들러** | Vite, Rollup, esbuild, webpack, rspack. |
| **다섯 가지 런타임** | React, Vue, Svelte, 순수 DOM, Node/Electron. |
| **AI 네이티브** | 내장 MCP 서버와 이식 가능한 Agent Skill. 특정 클라이언트에 묶이지 않습니다. |
| **여섯 언어 문서** | 문서 사이트 자체가 source-i18n으로 만들어졌습니다. |

## 어떤 느낌인가

```tsx
import { useT } from 'source-i18n/react'

export function Toolbar() {
  const t = useT()

  return (
    <button>{t('Save project')}</button>
  )
}
```

`source-i18n sync` 후의 카탈로그:

```json
{
  "locale": "zh-CN",
  "sourceLocale": "en-US",
  "messages": {
    "Save project": "保存项目"
  }
}
```

언어 바꾸기:

```ts
import { setLocale } from 'source-i18n'

setLocale('zh-CN')
```

필요한 API는 이게 전부입니다.

## 빠른 시작

```bash
npm i source-i18n
npx source-i18n init
```

`init`은 `source-i18n.config.mjs`와 `i18n/locales/`를 만들고 소스 언어, 대상 언어, 공급자를 묻습니다.

설정 파일은 `.mjs`, `.js`, `.cjs`, `.json`이며, **Node 22.13+**에서는 `.ts` / `.mts`도 됩니다. Node가 로드할 때 타입을 제거하므로 번들러도 추가 의존성도 필요 없습니다. Node 20에서는 `init`이 만든 `.mjs`를 사용하세요. Node가 TypeScript 설정을 처음 로드할 때 `ExperimentalWarning` 한 줄을 출력하지만 무해합니다.

플러그인 추가:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sourceI18n from 'source-i18n/unplugin/vite'

export default defineConfig({
  plugins: [sourceI18n()],
})
```

번들러 어댑터는 ESM 전용입니다(unplugin 3 기반). ESM 설정에서 불러오세요 — `vite.config.ts`, `rollup.config.mjs`, `webpack.config.mjs`, 또는 `"type": "module"` 패키지의 설정 파일. CommonJS `webpack.config.js`는 함수형 설정 안에서 `await import('source-i18n/unplugin/webpack')` 해야 합니다. 런타임 자체는 듀얼이며 `source-i18n`, `/react`, `/vue`, `/svelte`, `/vanilla`, `/node` 모두 `import`와 `require`를 지원합니다.

작성:

```tsx
<button>{t('Save project')}</button>
```

실행:

```bash
npm run dev
```

누락된 문자열은 UI에 표시되고 콘솔에도 보고됩니다. 개발 중 자동 번역은 **선택 사항**입니다. 누락 문자열을 공급자로 보내려면 `dev.autoTranslate`를 켜거나 다음을 실행하세요:

```bash
npx source-i18n sync
```

## 스택과 함께 쓰기

| 빌더 | UI | 런타임 |
|---|---|---|
| Vite | React 18 / 19 | 브라우저 |
| Rollup | Vue 3 | Node |
| esbuild | Svelte | Electron |
| webpack | 순수 DOM | SSR |
| rspack | | |

런타임은 작고 프레임워크에 자연스럽습니다. React는 hooks, Vue는 composables, Svelte는 store, 순수 HTML은 `data-i18n`, CLI와 데스크톱 메인 프로세스는 Node 어댑터를 씁니다.

## 공급자

| 공급자 | 잘 맞는 용도 |
|---|---|
| **OpenAI 호환** | 품질과 속도: OpenAI, DeepSeek, Moonshot, Groq, OpenRouter, 그 밖의 호환 엔드포인트. |
| **DeepL** | 유럽 언어와 용어집이 많은 제품. |
| **Ollama** | 완전 로컬 번역. 문구가 기계 밖으로 나가지 않습니다. |
| **수동** | 추출과 검증만 원하는 경우. |
| **사용자 정의** | `translate()` 메서드 하나로 직접 만든 번역 서비스. |

키는 환경 변수에 둡니다 — `OPENAI_API_KEY`, `SOURCE_I18N_API_KEY`, `DEEPL_API_KEY`, `OLLAMA_HOST`. Node에서만 읽고 브라우저로는 절대 전송되지 않습니다.

## CLI

| 명령 | 하는 일 |
|---|---|
| `source-i18n init` | 설정과 카탈로그 디렉터리를 만듭니다. |
| `source-i18n extract` | 번역될 모든 것을 나열합니다. 읽기 전용. |
| `source-i18n sync` | 누락된 번역을 채우고 카탈로그를 씁니다. |
| `source-i18n sync --dry-run` | 무슨 일이 일어날지만 보여줍니다. 네트워크도 쓰기도 없습니다. |
| `source-i18n format` | 카탈로그를 정규화합니다. 매 커밋 전에 실행해도 안전합니다. |
| `source-i18n check --strict` | CI 게이트: 누락, 잘못됨, 오래됨, 동적 호출. |
| `source-i18n skill --dir .claude/skills` | 이식 가능한 Agent Skill을 클라이언트 디렉터리에 설치합니다. |

`sync`는 사람의 수정을 절대 덮어쓰지 않습니다. `--prune`은 소스가 사라진 기계 항목만 지우고, `--prune-manual`은 명시적으로 선택해야 합니다.

## AI

이 패키지에는 에이전트가 실제로 필요한 인터페이스가 들어 있습니다.

**MCP 서버**

```bash
npm i -D source-i18n @modelcontextprotocol/sdk
npx source-i18n-mcp --root /path/to/project
```

도구: `i18n_extract`, `i18n_check`, `i18n_sync`. `sync`는 기본이 dry-run이며 명시적으로 확인할 때만 씁니다. 리소스는 마스킹된 설정과 카탈로그를 노출합니다.

**Agent Skill(이식 가능)**

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

Skill은 Agent Skills 오픈 표준을 따르며 Claude Code에 묶이지 않습니다. `.claude/skills/`는 한 클라이언트의 설치 디렉터리일 뿐이고, 다른 Agent Skills 클라이언트는 각자의 skills 경로에서 같은 폴더를 읽습니다. 기존 설치를 덮어쓰려면 `--force`를 쓰세요.

## 보안

- 공급자 키는 Node에만 남습니다. 브라우저 번들에는 카탈로그만 있습니다.
- 프로덕션 빌드에는 개발 엔드포인트와 개발 토큰이 없습니다.
- 개발 엔드포인트는 세션별 토큰, 동일 출처 요청, JSON을 요구합니다.
- MCP는 `apiKey`, `token`, `secret`, `password` 필드를 마스킹합니다.
- `npm publish`는 공개 대상 모든 파일을 비밀 스캔합니다.

## 문서

<img src="assets/docs.jpg" alt="source-i18n 문서 사이트" />

문서는 별도 사이트에서 관리됩니다. 설정, 개념, API, CLI, 구성, CI, 공급자, 예제, 문제 해결, AI 도구를 다루는 15개 페이지입니다.

6개 언어 — English, 中文, 日本語, 한국어, Español, Français — 로 제공되며 검색, 페이지 내 목차, 로케일 접두사 URL을 갖춥니다.

## 트레이드오프

source-i18n은 주관이 있습니다. 다음에 잘 맞습니다:

- 팀이 제품 안에 직접 문구를 쓰는 경우;
- 번역을 별도 포털이 아니라 빌드의 일부로 만들고 싶은 경우;
- 키 등록부 유지보다 출시를 중시하는 경우.

런타임 사용자 생성 콘텐츠, 백엔드 오류 문자열, 번역가 역할과 승인 흐름이 필요한 본격 TMS에는 맞지 않습니다.

소스 문자열을 바꾸면 새 카탈로그 항목이 생깁니다. 이것이 소스-애즈-키의 비용이며 번역 메모리가 존재하는 이유입니다.

## 상태

- 실제 번들러와 실제 브라우저를 포함한 `209`개 테스트
- Node.js `>= 20`
- MIT 라이선스
- 패키지: [`source-i18n`](https://www.npmjs.com/package/source-i18n)
- 소스와 이슈: [`wreckglow/source-i18n`](https://github.com/wreckglow/source-i18n)

## 면책 조항

source-i18n은 "있는 그대로" 제공되며 어떠한 보증도 하지 않습니다. 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.

- 기계 번역은 제3자 공급자가 생성하며 틀릴 수 있습니다. 출시 전에 카탈로그를 검토하세요. 유지관리자는 번역 오류, 누락 및 그 결과에 대해 책임지지 않습니다.
- 번역하기로 선택한 소스 문자열은 설정한 공급자(OpenAI 호환 엔드포인트, DeepL, Ollama, 직접 만든 provider, 또는 MCP 클라이언트 뒤의 모델)로 전송됩니다. 해당 데이터와 API 비용은 사용자와 공급자 사이의 일입니다.
- 의료, 법률, 안전, 금융, 규제 대상 등 잘못된 표현이 해를 끼칠 수 있는 상황에서는 사람의 검토 없이 기계 번역에 의존하지 마세요.

## 라이선스

MIT © source-i18n contributors

<br />

<div align="center">
  <sub>인터페이스를 쓰고, 모든 언어로 출시하세요.</sub>
</div>
