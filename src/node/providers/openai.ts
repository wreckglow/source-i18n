import type { Provider, ProviderConfig, TranslateRequest, TranslateResult } from '../../types.js'
import { parseTranslations, pluralSpecs, systemPrompt, userPrompt } from './prompt.js'

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

const RETRY_DELAYS = [0, 500, 1500]

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('aborted'))
      },
      { once: true },
    )
  })
}

/** Retries rate limits and server errors; 4xx other than 429 are final. */
async function requestWithRetry(
  run: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    await sleep(RETRY_DELAYS[attempt] ?? 0, signal)
    const response = await run()
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === RETRY_DELAYS.length - 1) return response
    try {
      await response.text()
    } catch {
      /* ignore: the connection is being discarded */
    }
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Any OpenAI-compatible chat completions endpoint: OpenAI, DeepSeek, Moonshot,
 * Groq, OpenRouter, a local gateway, ...
 */
export function createOpenAIProvider(config: ProviderConfig): Provider {
  const apiKey = config.apiKey ?? process.env.SOURCE_I18N_API_KEY ?? process.env.OPENAI_API_KEY
  const baseURL = (config.baseURL ?? process.env.SOURCE_I18N_BASE_URL ?? 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  )
  const model = config.model ?? process.env.SOURCE_I18N_MODEL ?? 'gpt-4o-mini'

  const post = async (
    req: TranslateRequest,
    signal: AbortSignal | undefined,
    jsonMode: boolean,
  ): Promise<Response> =>
    fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: systemPrompt(req) },
          { role: 'user', content: userPrompt(req) },
        ],
      }),
      signal,
    })

  return {
    name: 'openai',
    async translate(req, signal): Promise<TranslateResult> {
      if (!apiKey) {
        throw new ProviderError(
          'no API key: set OPENAI_API_KEY (or SOURCE_I18N_API_KEY), or configure provider.apiKey',
        )
      }

      let response = await requestWithRetry(() => post(req, signal, true), signal)
      // Not every compatible provider supports response_format.
      if (response.status === 400) {
        response = await requestWithRetry(() => post(req, signal, false), signal)
      }

      if (!response.ok) {
        throw new ProviderError(`provider returned ${response.status}: ${await readError(response)}`, response.status)
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[]
      }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new ProviderError('provider returned an unexpected payload')

      let parsed: Record<number, string>
      try {
        parsed = parseTranslations(content, pluralSpecs(req))
      } catch (error) {
        throw new ProviderError(`could not read the model reply: ${(error as Error).message}`)
      }

      const result: TranslateResult = {}
      req.items.forEach((item, index) => {
        const translation = parsed[index]
        if (typeof translation === 'string' && translation.trim()) result[item.id] = translation
      })
      return result
    },
  }
}
