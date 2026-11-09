<div align="center">

  <p>
    <a href="https://github.com/wreckglow/source-i18n/blob/main/README.md">English</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/zh-CN.md">简体中文</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ja-JP.md">日本語</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/ko-KR.md">한국어</a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/es-ES.md"><strong>Español</strong></a> ·
    <a href="https://github.com/wreckglow/source-i18n/blob/main/readme/fr-FR.md">Français</a>
  </p>

  <img src="assets/logo.svg" width="64" height="64" alt="source-i18n" />

  <h1>source-i18n</h1>

  <p>
    <strong>i18n sin claves.</strong><br />
    Escribe la interfaz. Publica en todos los idiomas.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/source-i18n"><img src="https://img.shields.io/npm/v/source-i18n?style=flat-square&color=e04a22" alt="npm" /></a>
    <img src="https://img.shields.io/badge/tests-209%20passing-2ea44f?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-141412?style=flat-square" alt="node" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-141412?style=flat-square" alt="license" /></a>
  </p>

  <p>
    <a href="#inicio-rápido">Inicio rápido</a> &nbsp;·&nbsp;
    <a href="#características">Características</a> &nbsp;·&nbsp;
    <a href="#documentación">Documentación</a> &nbsp;·&nbsp;
    <a href="#ia">IA</a>
  </p>
</div>

<img src="assets/hero.jpg" alt="source-i18n — escribe la interfaz, publica en todos los idiomas" />

## La idea

Las claves de traducción son un segundo idioma que tu equipo tiene que mantener.

`save_project_button_confirm` no es el texto. Es un nombre que alguien inventó, repetido en una docena de archivos y separado para siempre del texto que el usuario lee.

**source-i18n elimina la capa de claves.** El texto de origen es la clave.

```tsx
// antes
t('save_project_button_confirm')

// después
t('Save project')
```

En tiempo de compilación cada llamada a `t()` se extrae, se traduce con el proveedor que elijas y se inyecta como catálogo. Las ediciones humanas se conservan. Las cadenas que faltan hacen fallar CI, no a tus usuarios.

## Características

| Capacidad | Lo que obtienes |
|---|---|
| **Sin nombres de clave** | El texto que escribes es el identificador. Nada que inventar, renombrar o documentar. |
| **Extracción en compilación** | Cada llamada a `t()` / `$t()` se convierte en una entrada de catálogo. |
| **Libertad de proveedor** | API compatibles con OpenAI, DeepL, Ollama, modo manual o tu propio objeto provider. |
| **Las ediciones humanas mandan** | La salida de la máquina queda registrada con huella. Una vez editas una traducción, `sync --force` no la sobrescribe. |
| **Memoria de traducción** | Renombra una cadena de origen y la traducción anterior la sigue. |
| **Compatible con ICU** | Marcadores, plurales, formato de números y `context` para palabras ambiguas. |
| **Barrera de CI** | `check --strict` bloquea cadenas faltantes, marcadores rotos, entradas obsoletas y llamadas dinámicas. |
| **Seguro por defecto** | Los bundles de producción solo contienen catálogos: sin claves de proveedor, sin endpoint de desarrollo, sin peticiones de red. |
| **Cinco bundlers** | Vite, Rollup, esbuild, webpack y rspack. |
| **Cinco entornos** | React, Vue, Svelte, DOM nativo y Node/Electron. |
| **Nativo para IA** | Servidor MCP integrado y Agent Skill portátil, sin atarse a un cliente. |
| **Documentación en seis idiomas** | El sitio de documentación está hecho con source-i18n. |

## Cómo se siente

```tsx
import { useT } from 'source-i18n/react'

export function Toolbar() {
  const t = useT()

  return (
    <button>{t('Save project')}</button>
  )
}
```

Tu catálogo después de `source-i18n sync`:

```json
{
  "locale": "zh-CN",
  "sourceLocale": "en-US",
  "messages": {
    "Save project": "保存项目"
  }
}
```

Cambiar el idioma:

```ts
import { setLocale } from 'source-i18n'

setLocale('zh-CN')
```

Esa es toda la API que necesitas.

## Inicio rápido

```bash
npm i source-i18n
npx source-i18n init
```

`init` crea `source-i18n.config.mjs` y `i18n/locales/`, y luego pregunta tu idioma de origen, los idiomas de destino y el proveedor.

El archivo de configuración puede ser `.mjs`, `.js`, `.cjs` o `.json`, o `.ts` / `.mts` en **Node 22.13+**, donde Node elimina los tipos al cargar (sin bundler, sin dependencias extra). En Node 20 usa el `.mjs` que crea `init`. Node imprime un `ExperimentalWarning` de una línea la primera vez que carga una configuración TypeScript; es inofensivo.

Añade el plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sourceI18n from 'source-i18n/unplugin/vite'

export default defineConfig({
  plugins: [sourceI18n()],
})
```

Los adaptadores de bundler son solo ESM (están construidos sobre unplugin 3): cárgalos desde una configuración ESM — `vite.config.ts`, `rollup.config.mjs`, `webpack.config.mjs` o cualquier archivo de configuración en un paquete con `"type": "module"`. Un `webpack.config.js` en CommonJS tiene que hacer `await import('source-i18n/unplugin/webpack')` dentro de una configuración de función. El runtime es dual: `import` y `require` funcionan para `source-i18n`, `/react`, `/vue`, `/svelte`, `/vanilla`, `/node`.

Escribe:

```tsx
<button>{t('Save project')}</button>
```

Ejecuta:

```bash
npm run dev
```

Las cadenas que faltan se ven en la UI y se reportan en la consola. La traducción automática en desarrollo es **opcional**: activa `dev.autoTranslate` cuando quieras enviar las cadenas faltantes a tu proveedor, o ejecuta:

```bash
npx source-i18n sync
```

## Funciona con tu stack

| Constructores | UI | Runtime |
|---|---|---|
| Vite | React 18 / 19 | Navegador |
| Rollup | Vue 3 | Node |
| esbuild | Svelte | Electron |
| webpack | DOM nativo | SSR |
| rspack | | |

El runtime es pequeño y nativo del framework: hooks para React, composables para Vue, un store para Svelte, `data-i18n` para HTML plano y un adaptador Node para CLIs y procesos principales de escritorio.

## Proveedores

| Proveedor | Mejor para |
|---|---|
| **Compatible con OpenAI** | Calidad y velocidad: OpenAI, DeepSeek, Moonshot, Groq, OpenRouter o cualquier endpoint compatible. |
| **DeepL** | Idiomas europeos y productos con mucho glosario. |
| **Ollama** | Traducción totalmente local. Tu texto nunca sale de la máquina. |
| **Manual** | Solo quieres extracción y validación. |
| **Personalizado** | Tu propio servicio de traducción, detrás de un método `translate()`. |

Las claves van en variables de entorno — `OPENAI_API_KEY`, `SOURCE_I18N_API_KEY`, `DEEPL_API_KEY` u `OLLAMA_HOST`. Se leen en Node y nunca llegan al navegador.

## CLI

| Comando | Qué hace |
|---|---|
| `source-i18n init` | Crea la configuración y el directorio de catálogos. |
| `source-i18n extract` | Lista todo lo que se va a traducir. Solo lectura. |
| `source-i18n sync` | Rellena las traducciones que faltan y escribe los catálogos. |
| `source-i18n sync --dry-run` | Muestra qué pasaría. Sin red y sin escrituras. |
| `source-i18n format` | Normaliza los catálogos; seguro en cada commit. |
| `source-i18n check --strict` | La barrera de CI: faltantes, inválidas, obsoletas, dinámicas. |
| `source-i18n skill --dir .claude/skills` | Instala el Agent Skill portátil en el directorio de un cliente. |

`sync` nunca sobrescribe ediciones humanas. `--prune` solo elimina entradas de máquina cuyo origen desapareció, y `--prune-manual` requiere activarlo explícitamente.

## IA

El paquete incluye las interfaces que los agentes realmente necesitan.

**Servidor MCP**

```bash
npm i -D source-i18n @modelcontextprotocol/sdk
npx source-i18n-mcp --root /path/to/project
```

Herramientas: `i18n_extract`, `i18n_check` e `i18n_sync`. `sync` es dry-run por defecto y solo escribe con confirmación explícita. Los recursos exponen la configuración censurada y los catálogos.

**Agent Skill (portátil)**

```bash
npx source-i18n skill --dir <your-client-skills-dir>
```

El skill sigue el estándar abierto Agent Skills y no está atado a Claude Code. `.claude/skills/` es solo el directorio de instalación de un cliente; otros clientes de Agent Skills cargan la misma carpeta desde su propia ruta de skills. Usa `--force` para sobrescribir una instalación existente.

## Seguridad

- Las claves de proveedor se quedan en Node; el bundle del navegador solo contiene catálogos.
- Las compilaciones de producción no tienen endpoint de desarrollo ni token de desarrollo.
- El endpoint de desarrollo exige un token por sesión, peticiones del mismo origen y JSON.
- MCP censura los campos `apiKey`, `token`, `secret` y `password`.
- `npm publish` ejecuta un escaneo de secretos sobre cada archivo publicable.

## Documentación

<img src="assets/docs.jpg" alt="sitio de documentación de source-i18n" />

La documentación se mantiene en un sitio aparte: 15 páginas que cubren instalación, conceptos, API, CLI, configuración, CI, proveedores, ejemplos, solución de problemas y herramientas de IA.

Se publica en seis idiomas — English, 中文, 日本語, 한국어, Español, Français — con búsqueda, tabla de contenidos en la página y URLs con prefijo de idioma.

## Compromisos

source-i18n tiene opinión. Encaja cuando:

- tu equipo escribe el texto directamente en el producto;
- quieres que la traducción ocurra en la compilación, no en un portal aparte;
- te importa más publicar que mantener un registro de claves.

No es la herramienta adecuada para contenido generado por usuarios en tiempo de ejecución, cadenas de error del backend ni flujos que necesiten un TMS completo con roles de traductor y cadenas de aprobación.

Cambiar una cadena de origen crea una nueva entrada de catálogo. Ese es el coste de «el origen es la clave», y la razón por la que existe la memoria de traducción.

## Estado

- `209` pruebas, incluidos bundlers reales y un navegador real
- Node.js `>= 20`
- Licencia MIT
- Paquete: [`source-i18n`](https://www.npmjs.com/package/source-i18n)
- Código e issues: [`wreckglow/source-i18n`](https://github.com/wreckglow/source-i18n)

## Aviso legal

source-i18n se ofrece «tal cual», sin garantía de ningún tipo; consulta [LICENSE](./LICENSE).

- Las traducciones automáticas provienen de proveedores externos y pueden ser incorrectas. Revisa los catálogos antes de publicar; los mantenedores no se hacen responsables de errores de traducción, omisiones ni sus consecuencias.
- Las cadenas de origen que decidas traducir se envían al proveedor que configures (un endpoint compatible con OpenAI, DeepL, Ollama, tu propio provider o el modelo detrás de tu cliente MCP). Esos datos y el coste de la API son cosa tuya y del proveedor.
- No confíes en la traducción automática sin revisión humana donde una mala traducción pueda causar daños: contenido médico, legal, de seguridad, financiero o regulado.

## Licencia

MIT © source-i18n contributors

<br />

<div align="center">
  <sub>Escribe la interfaz. Publica en todos los idiomas.</sub>
</div>
