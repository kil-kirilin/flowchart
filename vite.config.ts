import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Добавьте это для отладки статических файлов
    fs: {
      strict: false
    }
  },
  // Явно указываем public директорию
  publicDir: 'public'
})