import { defineConfig } from "vite";

const MAX_APP_CHUNK_BYTES = 500 * 1024;

const enforceChunkBudgets = () => ({
  name: "echo-shift-chunk-budgets",
  generateBundle(_options: unknown, bundle: Record<string, { type: string; name?: string; code?: string }>) {
    for (const [fileName, item] of Object.entries(bundle)) {
      if (item.type !== "chunk" || item.name === "phaser" || !item.code) continue;
      const bytes = Buffer.byteLength(item.code, "utf8");
      if (bytes > MAX_APP_CHUNK_BYTES) {
        this.error(`Chunk ${fileName} is ${Math.round(bytes / 1024)} KiB, above the 500 KiB app chunk budget.`);
      }
    }
  }
});

export default defineConfig({
  plugins: [enforceChunkBudgets()],
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: "dist",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/phaser/")) return "phaser";
        }
      }
    }
  }
});
