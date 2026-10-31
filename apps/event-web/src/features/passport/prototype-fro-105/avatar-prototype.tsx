/*
  PROTOTYPE (FRO-105), throwaway. Three variants of the dashboard led by the guest's avatar,
  on the existing `/` route, switched with `?variant=A|B|C` (A when missing). Data comes from
  the same `useMe()` as the real dashboard; only the rendering swaps.
*/
import { useState } from "react";

import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { useMe } from "@/lib/session";

import { PrototypeStyles } from "@/features/passport/prototype-fro-105/pieces-ui";
import { useOutfit } from "@/features/passport/prototype-fro-105/use-outfit";
import * as A from "@/features/passport/prototype-fro-105/variant-a-flat";
import * as B from "@/features/passport/prototype-fro-105/variant-b-tilt";
import * as C from "@/features/passport/prototype-fro-105/variant-c-voxel";

const VARIANTS = [
  { key: "A", name: A.name },
  { key: "B", name: B.name },
  { key: "C", name: C.name },
];

export function AvatarPrototype() {
  const { me } = useMe();
  const outfit = useOutfit(me.stamps);
  const [variant, setVariant] = useState(
    () => new URLSearchParams(window.location.search).get("variant") ?? "A",
  );

  function change(key: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(window.history.state, "", url);
    setVariant(key);
  }

  const btn =
    "grid h-8 min-w-8 place-items-center rounded-full px-2 whitespace-nowrap hover:bg-white/15";
  return (
    <>
      <PrototypeStyles />
      {variant === "B" ? (
        <B.VariantB me={me} outfit={outfit} />
      ) : variant === "C" ? (
        <C.VariantC me={me} outfit={outfit} />
      ) : (
        <A.VariantA me={me} outfit={outfit} />
      )}
      <div className="h-20" />
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change}>
        <button type="button" className={btn} onClick={outfit.remove} aria-label="Remove a piece">
          −
        </button>
        <span className="font-mono text-xs">{outfit.wornCount}/6</span>
        <button type="button" className={btn} onClick={outfit.add} aria-label="Fake a stamp">
          + stamp
        </button>
      </PrototypeSwitcher>
    </>
  );
}
