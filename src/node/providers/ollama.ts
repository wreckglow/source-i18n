import type { Provider, ProviderConfig, TranslateResult } from '../../types.js'
import { ProviderError } from './openai.js'
import { parseTranslations, pluralSpecs, systemPrompt, userPrompt } from './prompt.js'

/** Fully local translation through Ollama (no API key, no data leaves the machine). */
export function createOllamaProvider(config: ProviderConfig): Provider {
  const baseURL = (config.baseURL ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const model = config.model ?? process.env.SOURCE_I18N_MODEL ?? 'qwen2.5:7b'

  return {
    name: 'ollama',
    async translate(req, signal): Promise<TranslateResult> {
      const response = await fetch(`${baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: systemPrompt(req) },
            { role: 'user', content: userPrompt(req) },
          ],
        }),
        signal,
      })

      if (!response.ok) {
        throw new ProviderError(
          `Ollama returned ${response.status}. Is "ollama serve" running with model "${model}"?`,
          response.status,
        )
      }

      const payload = (await response.json()) as { message?: { content?: unknown } }
      const content = payload.message?.content
      if (typeof content !== 'string') throw new ProviderError('Ollama returned an unexpected payload')

      const parsed = parseTranslations(content, pluralSpecs(req))
      const result: TranslateResult = {}
      req.items.forEach((item, index) => {
        const text = parsed[index]
        if (typeof text === 'string' && text.trim()) result[item.id] = text
      })
      return result
    },
  }
}
