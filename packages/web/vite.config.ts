import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // ローカル開発では API をローカルサーバー（npm run dev:api）に流す
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
