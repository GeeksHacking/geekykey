# Tailwind 4 notes (6 October 2026)

Moved here from `apps/event-web/CLAUDE.md` on 30 Oct 2026. Only the links between sections
changed.

The app moved from Tailwind 3.4 to 4 because Tailwind 3 depends on `braces`, which has a
security advisory with no fixed version, and the CI dependency audit fails on it. Every
screen was compared with the Tailwind 3 build, pixel by pixel, in both themes at 1280 and
390 px. Two small differences were kept: a table header that wraps is 2px shorter, and
the summary tiles' text moves 1px. What to know:

- There is no `tailwind.config.ts`. A token lives in `src/styles/globals.css` twice: as HSL
  channels in `:root` and `.dark`, and in the `@theme inline` block, which turns
  `--color-primary-text` into `text-primary-text` and so on. `globals.css` is identical in
  `apps/geekykey-web`, so change both together.
- Wrap a label and its field in `grid gap-2`, not `space-y-2`. Tailwind 4's `space-y` puts
  the margin on every child except the last, and an inline `<label>` ignores a vertical
  margin. `FormItem` already does this. `Label` uses `leading-6` so fields sit where they
  did on Tailwind 3.
- Tailwind 4 sets `scale-*` and `translate-*` through their own CSS properties, not
  `transform`. In a `transition-[...]` list, write `scale` (see `components/ui/button.tsx`).
  Do not copy shadcn's Tailwind 3 dialog classes `slide-in-from-left-1/2` or
  `slide-in-from-top-[48%]`: on Tailwind 4 they push the dialog off-centre.
- Some class names changed meaning. When copying an older snippet, use `outline-hidden`
  for `outline-none`, `shadow-xs` for `shadow-sm`, `shadow-sm` for `shadow`, `blur-xs` for
  `blur-sm`, `blur-sm` for a bare `blur`, `ring-3` for a bare `ring`, and
  `origin-(--radix-...)` for `origin-[--radix-...]`. `npx @tailwindcss/upgrade` does these
  renames, but not the three fixes above.
- `components.json` has an empty `tailwind.config`, so `pnpm dlx shadcn@latest add` writes
  Tailwind 4 components. The existing ones started as Tailwind 3 components, so check a new
  one's spacing against them.
