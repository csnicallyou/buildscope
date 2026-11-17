import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8780",
      "/auth": "http://127.0.0.1:8780",
      "/login": "http://127.0.0.1:8780",
    },
    watch: {
      ignored: [
        "**/output/**",
        "**/drawings/**",
        "**/.sites/**",
        "**/.deploy/**",
        "**/test-results/**",
      ],
    },
  },
});
