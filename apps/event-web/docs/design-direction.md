# Design direction

Moved here from `apps/event-web/CLAUDE.md` on 30 Oct 2026. Only the links between sections
changed.

Three rules that every change follows stay in CLAUDE.md under "Design rules": status is never
colour alone, the copy rules, and the four states.

The skill is written for landing pages and says dashboards and data tables are outside
its scope. GeekyKey is a product UI. Resolution:

**Apply everywhere:** Section 0 brief inference and anti-default discipline, 3.C icons,
3.E responsiveness, 4.1 typography, 4.2 one accent and the colour lock, 4.4 shape lock,
4.5 interactive states and contrast checks, 4.6 form rules, 6 performance and
accessibility, 8 dark mode protocol, 9 AI tells including the em-dash ban, and the
pre-flight check as adapted in CLAUDE.md's "Definition of done".

**Do not apply:** hero rules, eyebrows, bento, marquee, GSAP scroll patterns, image
generation requirements, and the Next.js and RSC defaults in 3.A. This is a Vite SPA on
Tailwind 4.

**Design read:** mobile-first product UI for hackathon participants plus a denser desktop
console for organisers, with a dark-capable, high-contrast tech-event language, leaning
shadcn/ui customised.

**Dials:** `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 3`, `VISUAL_DENSITY 5` on participant
screens and `7` on organiser screens. `MOTION_INTENSITY` is `6` on the map and on the
passport at 1024 px and up, the two screens a crowd watches (FRO-77). Symmetric grids, no
scroll choreography, no decorative motion.

**Theme:** follow `prefers-color-scheme`. When the browser reports no preference, use
dark. Both token sets live in `globals.css` as CSS variables in the shadcn convention.
A manual toggle in the app shell overrides the system setting and persists in
`localStorage`. Never flip theme per section. Check every screen in both.

**Palette:** the GeeksHacking branding kit (its Figma file), adopted on 14 Oct 2026 after
Julian approved the prototype. The kit's greys and one accent, its yellow `#FFF200`. The
yellow is the brand's own colour, so it stays at full saturation although the skill's 4.2
asks for less (8.B keeps the brand colour recognisable). It is a fill colour with `#1C1B1B`
text on it, and it needs two helpers on the light theme because yellow on the `#F5F5F5`
page is 1.07:1. `border-primary-edge` puts a `#1C1B1B` 1px edge on every yellow fill, as
the kit outlines its own components, and `text-primary-text` is what links, icons, and
active labels use: yellow on dark, `#706B00` on light. Never `text-primary` for text. The
current nav item is a solid yellow segment (`components/layout/nav-link.tsx`). The kit has
no dark theme, and its secondary grey fails on light; `globals.css` says what was derived
for each and the contrast it reaches. The ghost button is the app's own: the kit's
half-transparent one looks disabled and fails contrast. No pure `#000` or `#fff`. No
gradients, no glows.

**Look:** the showcase's sci-fi look (FRO-77), after games such as Wuthering Waves and
Arknights: Endfield, whose black and yellow is close to the kit's. Thin borders, corner
brackets, monospace labels and a faint grid, and nothing that's only decoration moves. It
lives in three places: `bg-look-grid` and `look-label` in `globals.css`, and
`components/look/corner-brackets.tsx`. The grid is drawn with `linear-gradient`, but as hard
1px lines, so "no gradients" still holds. The map, the participant screens and the organiser
console use it. On the console, the grid sits behind the content column and the sidebar stays
plain. `look-label` marks captions, column headings and field labels, never body text or the
tap log's values. Brackets frame the station board, the scan log, the summary's figures and
by-station table, the QR fallback's card and result, and each station dialog, never a table
row or a form field. The console keeps `VISUAL_DENSITY 7`, so the look adds no padding between
rows. The look supplies colour, type and decoration only, and no animation moves any of it, so
the grad tea's look (FRO-85) replaces those three and every animation plays the same. The
brackets sit just outside their box, and a table's scroll region sits inside them, so a
scrolling table never cuts a bracket off.

**Type:** Open Sans for UI, as the kit's typography page says. Its components page shows
Figtree, and the typography page wins. Geist Mono for points, station IDs, timestamps, and
counts, which the kit does not cover. Body text at normal weight, not the kit's 300,
because participants read in dim venues. The app's own text sizes, because the kit's 45px
heading is too big for a phone. `tracking-heading` (the kit's 0.5px) on headings and the
large figures. No oversized display type. The wordmark is the kit's logo, unrecoloured:
the secondary logo beside "GeekyKey" in the shells, and the primary logo over it on the
login and loading pages (`components/layout/wordmark.tsx`, files in `public/brand/`). Do
not add a display face to the app; spend that on the showcase poster if wanted.

**Shape:** one radius scale, from the kit's 12px corner. `rounded-lg` (12px) for cards,
dialogs, and inputs; `rounded-md` (10px) for buttons and badges. Document any exception in
this file.

**Layout:** participant screens designed at 360 to 430 px first, single column, one-line
bottom or top nav, `min-h-[100dvh]` never `h-screen`. Organiser screens designed at
1024 px and up with a sidebar and still usable at 768 px. `max-w-7xl mx-auto` containers.
CSS grid, never flex percentage math.

**Motion:** 150 to 250 ms on `transform` and `opacity` only, for feedback and state
change. Respect `prefers-reduced-motion`. `:active` gets `scale-[0.98]`. That is the rule on
phones and on the organiser screens. The exceptions, all on the big screens:

- The map's pulse runs about a second and grows its ring by the SVG `r` attribute, so it
  reads from the back of a hall. Several taps in one poll play one pulse each, up to 3, back
  to back and shortened to end before the next poll (FRO-102). With reduced motion it only fades.
- On the passport at 1024 px and up, a stamp earned is the one long animation (about a second:
  the seal presses in, then the note comes in), and points count up over 0.9 s. With reduced
  motion none of them play.
- The grad tea's avatar on the dashboard (FRO-105), at every width, phones included. A new
  piece's cubes fly in over about a second, the figure bobs and sways while nobody turns it, and
  at 6 of 6 it turns round once while gold confetti falls for 1.5 s. The memory card sways in its
  dialog. With reduced motion the figure stands still and none of them play.

Animate only a change, and never a poll that changed nothing. A plain, tested function
decides what changed between two polls (`features/map/pulses.ts`,
`features/passport/passport-changes.ts`), and the animation only plays what it returns. On
the passport, the screen marks each change with `data-changed` and clears the marks 2 s
later. Under 1024 px, a mark plays a 200 ms `tw-animate-css` enter animation through the
`phone-change:` variant in `globals.css`, unless reduced motion is asked for. At 1024 px and
up, GSAP plays the same marks instead, once each. `features/passport/use-passport-changes.ts`
keeps the last `/me` it saw in state to compare with, React's pattern for the previous render.
It is the one exception to "never a `useState` copy of something the cache holds".
