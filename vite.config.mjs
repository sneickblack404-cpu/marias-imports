import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default function () {
  return defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      proxy: {
        '/api': {
          target: 'http://localhost:3005',
          changeOrigin: true,
        },
      },
    },
  });
}
