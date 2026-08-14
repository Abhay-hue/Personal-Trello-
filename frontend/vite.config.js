import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: set `base` to "/<your-repo-name>/" when deploying to GitHub Pages
// e.g. if your repo is github.com/you/boardroom, use base: "/Personal-Trello-/"
export default defineConfig({
  plugins: [react()],
  base: "/Personal-Trello-/",
});
