import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Дашборда — отдельное приложение; офис для неё — только /api (порт офиса: OFFICE_PORT, по умолчанию 4700).
export default defineConfig({
    plugins: [react()],
    server: { port: 4701, proxy: { '/api': `http://127.0.0.1:${process.env['OFFICE_PORT'] ?? 4700}` } },
})
