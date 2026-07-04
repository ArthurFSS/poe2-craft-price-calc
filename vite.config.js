import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pricesFile = new URL('./prices.json', import.meta.url);
const pricesFilePath = fileURLToPath(pricesFile);
const pricesUpdatedAt = statSync(pricesFile).mtime.toISOString();

const pricesAssetPlugin = {
  name: 'emit-prices-json',
  buildStart() {
    this.addWatchFile(pricesFilePath);
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'prices.json',
      source: readFileSync(pricesFile),
    });
  },
};

export default defineConfig({
  plugins: [react(), pricesAssetPlugin],
  define: {
    __PRICES_UPDATED_AT__: JSON.stringify(pricesUpdatedAt),
  },
});
