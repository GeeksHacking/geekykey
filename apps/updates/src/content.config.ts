import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

import { AREAS, AUTHORS } from "./lib/project";

/**
 * One entry per check-in window. CONTENT-MODEL.md is the guide for whoever writes them;
 * this schema is the same rules, checked at build time.
 */
const entries = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/entries" }),
  schema: z
    .object({
      title: z.string().min(1),
      date: z.coerce.date(),
      window: z.object({
        from: z.coerce.date(),
        to: z.coerce.date(),
      }),
      sprint: z.number().int().min(1).max(4).optional(),
      authors: z.array(z.enum(AUTHORS)).min(1),
      summary: z.string().min(1),
      areas: z.array(z.enum(AREAS)).min(1),
      asks: z
        .array(z.object({ who: z.string().min(1), what: z.string().min(1) }))
        .optional(),
    })
    .refine((entry) => entry.window.from <= entry.window.to, {
      message: "window.from must be on or before window.to",
      path: ["window", "from"],
    })
    .refine((entry) => entry.date.getTime() === entry.window.to.getTime(), {
      message: "date must be the same day as window.to",
      path: ["date"],
    }),
});

export const collections = { entries };
