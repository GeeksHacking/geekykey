import { Wordmark } from "@/components/layout/wordmark";
import { CornerBrackets } from "@/components/look/corner-brackets";
import {
  BOOTH_KICKER,
  BOOTH_QUOTE,
  BOOTH_TITLE,
  CHANGES,
  CHANGES_HEADING,
  COSTS,
  COSTS_HEADING,
  PASSPORT_BODY,
  PASSPORT_EVIDENCE,
  PASSPORT_HEADING,
  STAYS,
  STAYS_HEADING,
  type BoothItem,
} from "@/features/booth/what-stays";

function Item({ item }: { item: BoothItem }) {
  return (
    <li>
      <h3 className="text-lg font-semibold tracking-heading lg:text-xl">{item.heading}</h3>
      <p className="mt-1 text-base lg:text-lg 2xl:text-xl">{item.body}</p>
      {item.note ? (
        <p className="mt-1 text-sm text-muted-foreground lg:text-base">{item.note}</p>
      ) : null}
    </li>
  );
}

/**
 * The booth visual at /what-stays. It reads no data, so it renders without the session and the
 * API, and the same page prints on one A3 sheet. The type is larger than the app's scale because
 * it is read from a step or two away.
 */
export function BoothVisual() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[120rem] flex-col bg-look-grid px-6 py-6 lg:px-10 lg:py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Wordmark />
          <span className="look-label text-muted-foreground">{BOOTH_KICKER}</span>
        </div>
        <h1 className="mt-4 max-w-[24ch] text-4xl font-semibold tracking-heading text-balance lg:text-5xl 2xl:text-6xl">
          {BOOTH_TITLE}
        </h1>
        <p className="mt-4 max-w-[58ch] border-l-4 border-primary-text pl-4 text-xl text-balance lg:text-2xl 2xl:text-3xl">
          {BOOTH_QUOTE}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:gap-8">
        <section className="relative rounded-lg border bg-card p-6 lg:p-8">
          <CornerBrackets />
          <h2 className="mb-5 inline-block rounded-md border border-primary-edge bg-primary px-3 py-1 text-2xl font-semibold tracking-heading text-primary-foreground lg:text-3xl">
            {STAYS_HEADING}
          </h2>
          <ul className="space-y-5">
            {STAYS.map((item) => (
              <Item key={item.heading} item={item} />
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-card p-6 lg:p-8">
          <h2 className="mb-5 text-2xl font-semibold tracking-heading lg:text-3xl">
            {CHANGES_HEADING}
          </h2>
          <ul className="space-y-5">
            {CHANGES.map((item) => (
              <Item key={item.heading} item={item} />
            ))}
          </ul>
        </section>
      </div>

      <section className="relative mt-6 rounded-lg border bg-card p-6 lg:mt-8 lg:p-8">
        <CornerBrackets />
        <h2 className="text-2xl font-semibold tracking-heading lg:text-3xl">{PASSPORT_HEADING}</h2>
        <p className="mt-3 max-w-[90ch] text-lg lg:text-xl 2xl:text-2xl">{PASSPORT_BODY}</p>
        <p className="mt-3 max-w-[90ch] text-sm text-muted-foreground lg:text-base">
          {PASSPORT_EVIDENCE}
        </p>
      </section>

      <section className="mt-6 border-t pt-5 lg:mt-8">
        <h2 className="look-label text-muted-foreground">{COSTS_HEADING}</h2>
        <ul className="mt-3 grid gap-3 lg:grid-cols-3 lg:gap-6">
          {COSTS.map((cost) => (
            <li key={cost} className="text-sm lg:text-base">
              {cost}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
