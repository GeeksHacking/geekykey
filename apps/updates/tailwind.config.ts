import type { Config } from "tailwindcss";

/**
 * Tailwind 3.4, the same version as apps/frontend. The colours are the app's own tokens
 * (see src/styles/global.css), so the two sites read as one brand.
 */
export default {
  darkMode: "media",
  content: ["./src/**/*.{astro,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          // For text in the accent colour. Yellow on dark, a darkened yellow on light.
          text: "hsl(var(--primary-text) / <alpha-value>)",
          // 1px edge for yellow fills. Charcoal on light, invisible on dark.
          edge: "hsl(var(--primary-edge) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
      },
    },
  },
} satisfies Config;
