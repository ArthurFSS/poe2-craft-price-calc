import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { statSync } from 'node:fs';

const pricesUpdatedAt = statSync(new URL('./prices.json', import.meta.url)).mtime.toISOString();

export default defineConfig({
  plugins: [react()],
  define: {
    __PRICES_UPDATED_AT__: JSON.stringify(pricesUpdatedAt),
  },
});
