import type { Provider, ProviderConfig, ResolvedConfig } from '../../types.js'
import { createDeepLProvider } from './deepl.js'
import { createOllamaProvider } from './ollama.js'
import { createOpenAIProvider } from './openai.js'

export interface ManualProvider extends Provider {
  name: 'manual'
}

const manual: ManualProvider = {
  name: 'manual',
  async translate() {
    return {}
  },
}

export function createProvider(config: ResolvedConfig): Provider {
  const configured = config.provider

  if (configured && typeof configured === 'object' && 'translate' in configured) {
    return withTimeout(configured as Provider, config.providerTimeout)
  }

  const options: ProviderConfig =
    typeof configured === 'string'
      ? { name: configured }
      : { name: 'openai', ...(configured as ProviderConfig | undefined) }

  switch (options.name) {
    case 'openai':
      return withTimeout(createOpenAIProvider(options), config.providerTimeout)
    case 'deepl':
      return withTimeout(createDeepLProvider(options), config.providerTimeout)
    case 'ollama':
      return withTimeout(createOllamaProvider(options), config.providerTimeout)
    case 'manual':
      return manual
    default:
      throw new Error(
        `source-i18n: unknown provider "${options.name}" (use "openai", "deepl", "ollama", "manual", or pass a custom Provider object)`,
      )
  }
}

/**
 * A provider that never answers would hang `sync` or the dev server forever.
 * Every call gets an abortable deadline; a caller-provided signal still wins.
 */
function withTimeout(provider: Provider, timeoutMs: number | undefined): Provider {
  const ms = timeoutMs ?? 60_000
  if (!ms || ms <= 0) return provider

  return {
    name: provider.name,
    translate: (req, signal) => {
      const deadline = AbortSignal.timeout(ms)
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
      return provider.translate(req, combined)
    },
  }
}

export { createOpenAIProvider, createDeepLProvider, createOllamaProvider, manual as manualProvider }
export { ProviderError } from './openai.js'
