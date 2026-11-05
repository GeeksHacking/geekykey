import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod/mini";

import { describeError, isApiError } from "@/api/errors";
import type { TokenKindsLoaded, TokenKindTotal } from "@/api/types";
import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { readWriterLog, type WriterLog } from "@/features/token-kinds/read-writer-log";
import { useLoadTokenKinds, useTokenKinds } from "@/features/token-kinds/use-token-kinds";
import { MAX_TOKENS_PER_LOAD } from "@/lib/constants";
import { useMe } from "@/lib/session";

const schema = z.object({
  log: z.string().check(
    z.refine(
      (log) => readWriterLog(log).tokens.length > 0,
      "No list lines in this log. A list line looks like 04E45150324189,E.",
    ),
    z.refine(
      (log) => readWriterLog(log).tokens.length <= MAX_TOKENS_PER_LOAD,
      `One load takes up to ${MAX_TOKENS_PER_LOAD} tokens. Split the log and load each part.`,
    ),
  ),
});

type LogValues = z.infer<typeof schema>;

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Whether a load that failed may have gone in anyway: the answer was lost or the
 * service gave up waiting, as opposed to the service refusing it.
 */
const mayHaveLoaded = (error: unknown) => !isApiError(error) || error.status >= 500;

/**
 * Where a GeekyKey admin puts the token writer's log on the list of token kinds, and
 * sees how many tokens each kind has (BAC-139). It's a GeekyKey screen and not an
 * organizer's, because a kind belongs to the token across events (ADR 0006) and the log
 * is full of UIDs, which an Event Service never sees (agreement 11.8).
 *
 * Someone who isn't a GeekyKey admin gets a refusal and no calls. The service refuses
 * them as well, so this is only what they see.
 */
export function TokenKindsPage() {
  const { me } = useMe();
  return (
    <main className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-heading">Token kinds</h1>
      {me.user.is_geekykey_admin ? (
        <>
          <ListTotals />
          <LoadForm />
        </>
      ) : (
        <div className="mt-6">
          <ErrorState
            error={null}
            title="Only GeekyKey admins can load token kinds."
            description={null}
          />
        </div>
      )}
    </main>
  );
}

/** The list as it stands, when the screen opens and again after each load. */
function ListTotals() {
  const totals = useTokenKinds();

  let body: ReactNode;
  if (totals.isError) {
    body = <ErrorState error={totals.error} onRetry={() => void totals.refetch()} />;
  } else if (totals.isPending) {
    body = (
      <div className="space-y-2" aria-label="Loading the list">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-7 w-48" />
      </div>
    );
  } else if (totals.data.length === 0) {
    body = (
      <p className="text-base text-muted-foreground">
        No tokens on the list yet. Paste the token writer's log below to load some.
      </p>
    );
  } else {
    body = <KindTotals kinds={totals.data} />;
  }

  return <Panel title="On the list">{body}</Panel>;
}

/**
 * The paste box. The browser reads the log, so the check of what it found needs no call
 * and nothing is written until Load. Load sends one kind for each UID.
 */
function LoadForm() {
  const load = useLoadTokenKinds();
  const form = useForm<LogValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { log: "" },
  });
  const log = useWatch({ control: form.control, name: "log" });
  const found = useMemo(() => readWriterLog(log), [log]);

  function onSubmit(values: LogValues) {
    load.mutate(readWriterLog(values.log).tokens, { onSuccess: () => form.reset() });
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
          <FormField
            control={form.control}
            name="log"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token writer's log</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    onChange={(event) => {
                      load.reset();
                      field.onChange(event);
                    }}
                    className="min-h-48 font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormControl>
                <FormDescription>
                  Paste the Serial Monitor's text as it is. The screen reads only lines such as
                  04E45150324189,E. Loading never removes a token, and a token not in the log keeps
                  its kind.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {log.trim() === "" ? null : <LogCheck found={found} />}
          {load.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {describeError(load.error)}
              {mayHaveLoaded(load.error)
                ? " The load may have gone in anyway. Loading again is safe, but those tokens then count as already having that kind, and anyone who already has a kind keeps it."
                : null}
            </p>
          ) : null}
          <Button type="submit" disabled={!form.formState.isValid || load.isPending}>
            {load.isPending ? "Loading" : "Load"}
          </Button>
        </form>
      </Form>
      {load.isSuccess ? <LoadResult loaded={load.data} /> : null}
    </>
  );
}

/** What Load would send, and the lines worth a second look, before anything is written. */
function LogCheck({ found }: { found: WriterLog }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-lg border p-4">
      <h2 id={headingId} className="text-base font-semibold">
        In this log
      </h2>
      <div className="mt-3 space-y-3">
        <KindTotals kinds={found.kinds} />
        {found.skipped > 0 ? (
          <p className="text-sm text-muted-foreground">
            Skipped {counted(found.skipped, "other line", "other lines")}
          </p>
        ) : null}
        {found.flagged.length > 0 ? (
          <div className="text-sm">
            <p className="font-medium">
              These lines have a comma but aren't list lines, so they won't load. Check each one.
            </p>
            <ul aria-label="Lines to check" className="mt-2 space-y-1 font-mono break-all">
              {found.flagged.map((line, index) => (
                // The same mistake can be pasted twice, so a line alone isn't a key.
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** What the load did to the list. */
function LoadResult({ loaded }: { loaded: TokenKindsLoaded }) {
  return (
    <div className="mt-6">
      <Panel title="Loaded">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <Count label="New" value={loaded.new} />
          <Count label="Changed kind" value={loaded.changed} />
          <Count label="Already had that kind" value={loaded.unchanged} />
        </dl>
        {loaded.changed > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Anyone who already has a kind keeps it, because the Event Service keeps a user's first
            kind.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The tokens of each kind and all of them together. */
function KindTotals({ kinds }: { kinds: TokenKindTotal[] }) {
  const total = kinds.reduce((sum, { tokens }) => sum + tokens, 0);
  return (
    <div>
      <p className="text-sm text-muted-foreground">{counted(total, "token", "tokens")}</p>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
        {kinds.map(({ kind, tokens }) => (
          <Count key={kind} label={kind} value={tokens} />
        ))}
      </dl>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
