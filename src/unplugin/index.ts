import { createUnplugin } from 'unplugin'
import { Engine, RESOLVED_VIRTUAL_ID, VIRTUAL_ID, WEBPACK_VIRTUAL_ID, type Options } from './engine.js'

export type { Options }
export { Engine, VIRTUAL_ID, RESOLVED_VIRTUAL_ID } from './engine.js'

/**
 * The unplugin factory. Use the small adapters instead of this directly:
 *
 *   import keyless from 'source-i18n/unplugin/vite'
 *   plugins: [keyless()]
 */
export const unplugin = createUnplugin<Options | undefined>((options, meta) => {
  const engine = options?.engine ?? new Engine({ ...options, framework: meta.framework })

  return {
    name: 'source-i18n',
    // Run after framework compilers (Vue/Svelte/JSX) so we always see plain JS.
    enforce: 'post' as const,
    async buildStart() {
      await engine.init()
      const failure = await engine.buildGate()
      if (!failure) return

      // Webpack/Rspack: report as a normal compilation error. Rollup/Vite: use
      // the plugin context so the build fails cleanly instead of crashing.
      const native = (this as unknown as { getNativeBuildContext?: () => { compilation?: { errors?: unknown[] } } })
        .getNativeBuildContext?.()
      const errors = native?.compilation?.errors
      if (errors) {
        errors.push(new Error(failure))
        return
      }

      const fail = (this as unknown as { error?: (message: string) => never }).error
      if (typeof fail === 'function') fail.call(this, failure)
      else throw new Error(failure)
    },
    async transform(code: string, id: string) {
      return engine.transform(code, id)
    },
    resolveId(id: string) {
      return engine.resolveId(id)
    },
    async load(id: string) {
      return engine.load(id)
    },
    // Webpack/Rspack treat modules as side-effect-free when the nearest
    // package.json says `"sideEffects": false`. The virtual catalog module only
    // has side effects, so it must be marked explicitly or it gets tree-shaken.
    webpack(compiler: any) {
      engine.setRoot(compiler.context ?? compiler.options?.context ?? '')
      engine.setDev(compiler.options?.mode !== 'production')
      markCatalogsSideEffectful(compiler)
    },
    rspack(compiler: any) {
      engine.setRoot(compiler.context ?? compiler.options?.context ?? '')
      engine.setDev(compiler.options?.mode !== 'production')
      markCatalogsSideEffectful(compiler)
    },
    vite: {
      configResolved(config: any) {
        engine.setRoot(config.root)
        engine.setDev(config.command === 'serve')
      },
      configureServer(server: any) {
        engine.setDev(true)
        engine.setCatalogsChangedHandler(() => {
          const invalidate = (server.moduleGraph as any)?.getModuleById?.(RESOLVED_VIRTUAL_ID)
          if (invalidate) void (server.moduleGraph as any).invalidateModule(invalidate)
        })
        engine.attachMiddleware(server.middlewares)
      },
    },
  }
})

function markCatalogsSideEffectful(compiler: any): void {
  compiler.hooks.compilation.tap('source-i18n', (compilation: any) => {
    compilation.hooks.buildModule.tap('source-i18n', (module: any) => {
      const resource = typeof module.resource === 'string' ? module.resource : ''
      if (!resource) return
      let decoded = resource
      try {
        decoded = decodeURIComponent(resource)
      } catch {
        /* keep the raw resource */
      }
      if (!decoded.includes(VIRTUAL_ID) && !decoded.includes(WEBPACK_VIRTUAL_ID)) return
      try {
        module.factoryMeta = module.factoryMeta ?? {}
        module.factoryMeta.sideEffectFree = false
      } catch {
        // Rspack modules are native objects with read-only internals; the used
        // binding injected by the transform already keeps the module alive.
      }
    })
  })
}

export default unplugin
