// @ts-check
import { satteri } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";

// A static site: `astro build` writes plain HTML to dist/, which Cloudflare Pages serves.
export default defineConfig({
  // Photos in entries get a set of smaller WebP copies, so a phone downloads one sized
  // for its screen instead of the 4000px original. That work is done by sharp, which is a
  // direct dependency (pinned to the version astro resolves) because Astro bundles its
  // image code into the build, and the bundle can only import packages this app declares.
  image: { layout: "constrained" },

  markdown: {
    // Smart quotes and ellipses stay on. Dashes stay off: the design rules ban en and em
    // dashes, and with this on, a "--" in an entry would quietly render as one.
    // package.json pins @astrojs/markdown-satteri to the exact version astro uses.
    processor: satteri({ features: { smartPunctuation: { dashes: false } } }),
  },
});
