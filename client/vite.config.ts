// ตั้งค่า build และพร็อกซี API สำหรับการพัฒนา
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: {
    '/api/payment-clock': { target: 'http://localhost:3000', rewrite: () => '/health' },
    '/api': 'http://localhost:3000',
  } },
})
