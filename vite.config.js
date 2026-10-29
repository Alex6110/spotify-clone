import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend locale; cambialo con VITE_DEV_API_TARGET (es. l'indirizzo del server di casa)
  const target = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5001'
  const proxied = { target, changeOrigin: true, secure: false }

  return {
    plugins: [react()],
    server: {
      host: true, // consente al telefono di collegarsi in rete locale
      proxy: {
        '/api': proxied,
        '/covers': proxied,
        '/artist-photos': proxied,
        '/socket.io': { ...proxied, ws: true },
      },
    },
  }
})
