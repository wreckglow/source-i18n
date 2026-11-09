import type { Provider, ProviderConfig, TranslateResult } from '../../types.js'
import { ProviderError } from './openai.js'

function targetCode(locale: string): string {
  const lower = locale.toLowerCase()
  if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk')) return 'ZH-HANT'
  if (lower.startsWith('zh')) return 'ZH'
  if (lower.startsWith('en')) return lower === 'en-gb' ? 'EN-GB' : 'EN-US'
  if (lower.startsWith('pt-br')) return 'PT-BR'
  if (lower.startsWith('pt')) return 'PT-PT'
  return lower.split('-')[0]!.toUpperCase()
}

/** DeepL translate API (free keys end with ":fx"). */
export function createDeepLProvider(config: ProviderConfig): Provider {
  const apiKey = config.apiKey ?? process.env.SOURCE_I18N_DEEPL_KEY ?? process.env.DEEPL_API_KEY
  const baseURL = (
    config.baseURL ?? (apiKey?.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
  ).replace(/\/+$/, '')

  return {
    name: 'deepl',
    async translate(req, signal): Promise<TranslateResult> {
      if (!apiKey) {
        throw new ProviderError('no DeepL key: set DEEPL_API_KEY or configure provider.apiKey')
      }

      const body = new URLSearchParams()
      body.set('auth_key', apiKey)
      for (const item of req.items) body.append('text', item.text)
      body.set('source_lang', req.from.split('-')[0]!.toUpperCase())
      body.set('target_lang', targetCode(req.to))
      body.set('preserve_formatting', '1')

      const response = await fetch(`${baseURL}/v2/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal,
      })

      if (!response.ok) {
        throw new ProviderError(`DeepL returned ${response.status}`, response.status)
      }

      const payload = (await response.json()) as { translations?: { text?: string }[] }
      const result: TranslateResult = {}
      req.items.forEach((item, index) => {
        const text = payload.translations?.[index]?.text
        if (typeof text === 'string' && text.trim()) result[item.id] = text
      })
      return result
    },
  }
}
