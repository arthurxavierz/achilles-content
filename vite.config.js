import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode !== 'demo') {
    const missing = ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].filter(key => !env[key])
    if (missing.length) throw new Error(`Build bloqueado. Configure: ${missing.join(', ')}`)
  }
  return { plugins: [react()], server: { port: 5173 }, build: { sourcemap: false } }
})
