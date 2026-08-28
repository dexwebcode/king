import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },

  server: {
    allowedHosts: [
      "monument-cuddly-outsell.ngrok-free.dev",
    ],
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/price': 'http://127.0.0.1:8000',
      '/auth': 'http://127.0.0.1:8000',
      '/social': 'http://127.0.0.1:8000',
      '/telegram': 'http://127.0.0.1:8000',
      '/vk': 'http://127.0.0.1:8000',
    },
  },
});
