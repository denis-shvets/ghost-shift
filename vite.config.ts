import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Runs server code in the Cloudflare Workers runtime, in dev and in the build.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    // React's plugin must come after Start's plugin.
    viteReact(),
  ],
});
