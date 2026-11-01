import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5190,
    open: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
