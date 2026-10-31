/*
  PROTOTYPE (FRO-105), variant A: flat hero. The avatar leads the dashboard as stacked PNG
  layers, the six slot icons replace the stamp count, and the old sections follow below.
  CSS only, so it fits the phone rule as it stands.
*/
import type { MeResponse } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { ParticipantTapList } from "@/components/participant-tap-list";
import { LatestStampRow } from "@/features/passport/latest-stamp-row";

import { NextPieceLine, PieceIcon } from "@/features/passport/prototype-fro-105/pieces-ui";
import { useBodyUrl, useLayerUrl } from "@/features/passport/prototype-fro-105/use-layer-url";
import type { Outfit, Slot } from "@/features/passport/prototype-fro-105/use-outfit";

export const name = "Flat hero";

function LayerImg({ slot, isNew }: { slot: Slot; isNew: boolean }) {
  const url = useLayerUrl(slot.piece.pixels);
  return (
    <img
      src={url}
      alt=""
      className="fro105-pixelated absolute inset-0 size-full"
      style={isNew ? { animation: "fro105-pop 600ms cubic-bezier(.2,.8,.2,1)" } : undefined}
    />
  );
}

export function VariantA({ me, outfit }: { me: MeResponse; outfit: Outfit }) {
  const body = useBodyUrl();
  const latest = me.stamps
    .filter((stamp) => stamp.earned_at !== null)
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
    .slice(0, 3);

  return (
    <div className="space-y-10">
      <section className="flex flex-col items-center text-center">
        <div className="relative size-64 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.22),transparent_65%)]">
          <img src={body} alt="" className="fro105-pixelated absolute inset-0 size-full" />
          {outfit.slots.map((slot, i) =>
            slot.worn ? (
              <LayerImg
                key={`${slot.piece.key}-${outfit.lastAdded?.index === i ? outfit.lastAdded.at : 0}`}
                slot={slot}
                isNew={outfit.lastAdded?.index === i}
              />
            ) : null,
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-heading">{me.user.display_name}</h1>
        <ul className="mt-4 flex gap-2" aria-label="Outfit pieces">
          {outfit.slots.map((slot) => (
            <li
              key={slot.piece.key}
              title={slot.piece.label}
              className="grid size-11 place-items-center rounded-md border bg-card"
            >
              <PieceIcon slot={slot} className="size-7" />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {outfit.wornCount} of 6 pieces · {me.points} points
        </p>
        <NextPieceLine outfit={outfit} className="mt-3 text-sm" />
      </section>

      <section>
        <SectionHeading title="Latest stamps" linkTo="/passport" linkLabel="Open passport" />
        {latest.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {latest.map((stamp) => (
              <LatestStampRow key={stamp.station_id} stamp={stamp} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No stamps yet.</p>
        )}
      </section>

      <section>
        <SectionHeading title="Recent activity" linkTo="/activity" linkLabel="All activity" />
        <ParticipantTapList taps={me.recent_taps} limit={3} />
      </section>
    </div>
  );
}
