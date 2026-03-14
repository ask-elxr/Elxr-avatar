import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Plugin to serve admin.html instead of index.html in dev mode.
// Vite's built-in SPA fallback always serves index.html (the main app).
// This plugin rewrites non-asset requests to /admin.html so the admin entry loads.
function adminSpaFallback(): Plugin {
  return {
    name: 'admin-spa-fallback',
    configureServer(server) {
      // Direct call (no returned function) = pre-hook, runs BEFORE Vite's
      // built-in SPA fallback which would otherwise serve index.html
      server.middlewares.use((req, _res, next) => {
        if (
          req.url &&
          !req.url.includes('.') &&
          !req.url.startsWith('/api') &&
          !req.url.startsWith('/ws') &&
          !req.url.startsWith('/@') &&
          !req.url.startsWith('/src/') &&
          !req.url.startsWith('/node_modules/')
        ) {
          req.url = '/admin.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    adminSpaFallback(),
    // Rename admin.html -> index.html after build so Firebase Hosting SPA rewrite works
    {
      name: 'rename-admin-html',
      closeBundle() {
        const outDir = path.resolve(import.meta.dirname, "dist/admin");
        const src = path.join(outDir, "admin.html");
        const dest = path.join(outDir, "index.html");
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
        }
      },
    },
  ],
  resolve: {
    alias: {
      // Swap queryClient and adminAuth to use admin-specific versions
      // that prefix API calls with VITE_API_BASE_URL and always send X-Admin-Secret
      "@/lib/queryClient": path.resolve(import.meta.dirname, "client", "src", "lib", "adminQueryClient.ts"),
      "@/lib/adminAuth": path.resolve(import.meta.dirname, "client", "src", "lib", "adminQueryClient.ts"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/admin"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "client", "admin.html"),
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      '/api': 'http://localhost:5000',
      '/ws': { target: 'http://localhost:5000', ws: true },
    },
  },
});
