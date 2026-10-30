# Scaffold notes

Moved here from `apps/event-web/CLAUDE.md` on 30 Oct 2026. Only the links between sections
changed.

The TypeScript rule itself is in the stack table.

## TypeScript version

TypeScript 6.0 is the target. Vite 8 transpiles with oxc and ignores the TS version.
**npm's `latest` tag is TypeScript 7**, the Go port, and the repo stays on 6.0 for now.
Always install with an explicit `typescript@~6.0.3`; never a bare `pnpm add -D typescript`.
If any tool rejects 6.0 at scaffold time, fall back to `typescript@~5.9` and record why in
this section.

## Scaffold notes (18 September 2026)

Verified when the app was scaffolded:

- TypeScript 6.0.3 works with Vite 8.3, `@vitejs/plugin-react` 6.1, `@tanstack/router-plugin`
  1.168, typescript-eslint 8.70, and Vitest 5.
- The shadcn CLI resolves the `@/` alias from `tsconfig.json`, so the solution tsconfig
  must keep `compilerOptions.paths`. Without it the CLI writes into a literal `@/` folder.
  (The app started on Tailwind 3.4; see [tailwind-4.md](tailwind-4.md) for the move.)
- pnpm 11 refuses to run esbuild's install script unless `allowBuilds` lists it in
  `pnpm-workspace.yaml`. Done at the repo root.
- shadcn's `sonner` component imports `next-themes`. Ours reads `lib/theme` instead.
- The `react/static-components` and `react/incompatible-library` rules flag components
  looked up during render and react-hook-form's `watch()`. Use `useWatch` and render
  looked-up icons through a small component (see `features/passport/station-glyph.tsx`).
- TanStack Table moved from v8 to v9 on 18 Sep 2026 while the scan log was the only table.
  v9 is `useTable({ features, columns, data })` with `tableFeatures({})`; there is no
  `getCoreRowModel`, and `<table.FlexRender cell={cell} />` replaces `flexRender`. Most
  tutorials and the shadcn data-table recipe still show v8; the package ships its own
  migration notes under `node_modules/@tanstack/react-table/skills`.
- Never redirect with a `<Navigate />` element from a component that re-renders. It
  navigates again whenever its props object changes, which is every render, and the router
  never commits, so the page freezes on the loading view. Redirect from a `useEffect` with
  stable dependencies instead (see `features/auth/require-session.tsx`).
