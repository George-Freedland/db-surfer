import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5175 to avoid clashing with other local dev servers on 5173
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4400',
    },
  },
})
