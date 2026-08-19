/**
 * Simple client bundler for dsh-user-approval
 * Bundles client code into lib/client.js
 */
import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Platform modules (external dependencies)
const EXTERNAL = [
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
]

async function build() {
  try {
    // Bundle client code
    const result = await esbuild.build({
      entryPoints: ['src/client/index.ts'],
      bundle: true,
      outfile: 'lib/client.js',
      format: 'cjs',
      platform: 'browser',
      target: 'es2022',
      sourcemap: true,
      external: EXTERNAL,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      banner: `window.__ModuleLoader__.load({ id: "dsh-user-approval", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    })

    console.log('✓ Client bundle created: lib/client.js')

    // Inject CSS module loader
    const clientJs = readFileSync('lib/client.js', 'utf-8')
    const cssLoader = `
// CSS Module Loader
function loadCssModule(cssPath) {
  const css = require('fs').readFileSync(require.resolve(cssPath), 'utf-8');
  const classes = {};
  const classRegex = /\\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = classRegex.exec(css)) !== null) {
    classes[match[1]] = match[1];
  }
  return { default: classes };
}
`
    writeFileSync('lib/client.js', cssLoader + clientJs)
    console.log('✓ CSS module loader injected')

  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

build()
