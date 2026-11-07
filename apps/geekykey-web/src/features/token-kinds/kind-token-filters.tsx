import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  isFiltering,
  START_QUERY,
  type KindTokenQuery,
  type KindTokenSort,
  type Ownership,
} from "@/features/token-kinds/kind-token-view";
import { cn } from "@/lib/utils";

const OWNERSHIP: { value: Ownership; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
];

const SORTS: { value: KindTokenSort; label: string }[] = [
  { value: "uid-asc", label: "UID, A to Z" },
  { value: "uid-desc", label: "UID, Z to A" },
  { value: "kind-asc", label: "Kind, A to Z" },
  { value: "kind-desc", label: "Kind, Z to A" },
];

/** A chosen filter takes the palest yellow, so it stands out from one left at its default. */
const chosenFilterClass = "border-primary-edge bg-accent text-accent-foreground";

/**
 * The search, the kind and ownership filters and the sort, above Every token. The
 * ownership choice is three native radios drawn as one segmented control, so arrow keys
 * move between them as in any radio group.
 */
export function KindTokenFilters({
  query,
  kinds,
  onChange,
}: {
  query: KindTokenQuery;
  kinds: string[];
  onChange: (next: Partial<KindTokenQuery>) => void;
}) {
  const id = useId();
  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${id}-search`} className="text-sm font-medium">
            Search by UID
          </label>
          <Input
            id={`${id}-search`}
            value={query.search}
            autoComplete="off"
            spellCheck={false}
            className={cn("mt-2 font-mono", query.search !== "" && chosenFilterClass)}
            onChange={(event) => onChange({ search: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            Filter by kind
          </label>
          <div className="mt-2">
            <NativeSelect
              id={`${id}-kind`}
              value={query.kind}
              className={cn(query.kind !== "" && chosenFilterClass)}
              onChange={(event) => onChange({ kind: event.target.value })}
            >
              <option value="">All kinds</option>
              {kinds.map((value) => (
                <option key={value} value={`kind:${value}`}>
                  {value}
                </option>
              ))}
              <option value="none">No kind</option>
            </NativeSelect>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-sort`} className="text-sm font-medium">
            Sort by
          </label>
          <div className="mt-2">
            <NativeSelect
              id={`${id}-sort`}
              value={query.sort}
              onChange={(event) => onChange({ sort: event.target.value as KindTokenSort })}
            >
              {SORTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <fieldset>
          <legend className="text-sm font-medium">Ownership</legend>
          <div className="mt-2 inline-flex h-10 rounded-md border border-input bg-background p-1">
            {OWNERSHIP.map(({ value, label }) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-ownership`}
                  value={value}
                  checked={query.ownership === value}
                  onChange={() => onChange({ ownership: value })}
                  className="peer sr-only"
                />
                <span className="flex h-full items-center rounded-sm border border-transparent px-3 text-sm text-muted-foreground transition-colors peer-checked:border-primary-edge peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 hover:text-foreground">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {isFiltering(query) ? (
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                search: START_QUERY.search,
                kind: START_QUERY.kind,
                ownership: START_QUERY.ownership,
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
