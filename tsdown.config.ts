import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    client: 'src/client/index.ts',
  },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  sourcemap: true,
  clean: false,
  external: [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-slots',
    'react',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.MODE': '"production"',
    'import.meta.env': '{"MODE":"production"}',
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: "dsh-user-approval", factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
