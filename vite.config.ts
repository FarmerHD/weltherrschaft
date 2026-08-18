import { defineConfig } from "vite";

// Base path is set so the built site works correctly when hosted at
// https://<username>.github.io/<repo-name>/ via GitHub Pages.
// If you deploy to a custom domain or to <username>.github.io directly
// (a "user site" repo), change this to "/".
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
});
