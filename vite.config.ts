import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import JavaScriptObfuscator from 'javascript-obfuscator'

const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
}

const obfuscateApplicationBundle = (): Plugin => ({
  name: 'genmatrix-application-obfuscator',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk' || item.fileName.includes('vendor')) continue

      item.code = JavaScriptObfuscator.obfuscate(item.code, obfuscationOptions).getObfuscatedCode()
    }
  },
})

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      ...(isProduction ? [obfuscateApplicationBundle()] : []),
    ],
    build: {
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor'
          },
        },
      },
    },
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
      legalComments: 'none',
    },
    server: {
      host: '127.0.0.1',
    },
  }
})
