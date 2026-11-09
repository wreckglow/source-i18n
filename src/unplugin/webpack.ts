import { unplugin } from './index.js'
import type { Options } from './engine.js'
import type { Compiler } from 'webpack'

/**
 * Webpack / Rspack plugin.
 *
 *   import KeylessPlugin from 'source-i18n/unplugin/webpack'
 *   plugins: [new KeylessPlugin()]
 *
 * The same entry works for both: the compiler is inspected at apply time, so
 * unplugin knows whether it is running under webpack or rspack (the framework
 * decides which virtual module id is used).
 */
export class KeylessPlugin {
  private readonly options: Options

  constructor(options: Options = {}) {
    this.options = options
  }

  apply(compiler: Compiler): void {
    const isRspack = Boolean((compiler as unknown as { rspack?: unknown }).rspack)
    const factory = isRspack ? unplugin.rspack : unplugin.webpack
    const plugin = factory(this.options) as unknown as { apply: (compiler: Compiler) => void }
    plugin.apply(compiler)
  }
}

export default KeylessPlugin
