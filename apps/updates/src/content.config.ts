import { defineCollection } from "astro:content";
import { file, glob, type Loader } from "astro/loaders";
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

/**
 * Astro's file() loader only logs a YAML mistake, and keeps the lines cached from the last
 * build that worked, so a local build would publish stale lines without failing. This stops
 * the build instead. In `astro dev` a mistake made after start-up empties the collection,
 * so the page fails and the log above it says why.
 */
function strict(loader: Loader): Loader {
  return {
    ...loader,
    load: async (context) => {
      const problems: string[] = [];
      const logger = Object.create(context.logger, {
        error: {
          value: (message: string) => {
            problems.push(message);
            context.store.clear();
            context.logger.error(message);
          },
        },
        // file() puts the YAML parser's own message at debug level, just after the error.
        debug: {
          value: (message: string) => {
            if (problems.length > 0) problems.push(message);
            context.logger.debug(message);
          },
        },
      });
      await loader.load({ ...context, logger });
      if (problems.length > 0) throw new Error(problems.join("\n"));
    },
  };
}

/**
 * One line per shipped, visible change, oldest first in the file. CONTENT-MODEL.md has the
 * rules; src/lib/changelog.ts checks what a schema cannot, such as the order of the lines.
 */
const changelog = defineCollection({
  loader: strict(file("./src/content/changelog.yaml")),
  schema: z.object({
    date: z.coerce.date(),
    area: z.enum(AREAS),
    change: z.string().min(1),
    // Only needed when two entries end on the same day: the id of the earlier one, on the
    // last line it covers. Every line after it belongs to the next entry.
    closes: z.string().optional(),
  }),
});

export const collections = { entries, changelog };
