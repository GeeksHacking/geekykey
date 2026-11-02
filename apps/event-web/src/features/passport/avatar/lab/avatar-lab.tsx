import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CHARACTERS, composite, type PieceKey } from "@/features/passport/avatar/art";
import { AvatarColourPicker } from "@/features/passport/avatar/avatar-colour-picker";
import { recolour } from "@/features/passport/avatar/avatar-colours";
import { toDataUrl } from "@/features/passport/avatar/layers";
import { useAvatarColours } from "@/features/passport/avatar/use-avatar-colours";
import { VOXEL_FIGURES } from "@/features/passport/avatar/voxel-data";
import { createWorld, type PickedCube, type World } from "@/features/passport/avatar/voxel-world";

/*
  The avatar lab (FRO-105): a page on the dev server only, at /avatar-lab.html, for checking
  the 3D figures while editing them. It shows a figure from any side, beside the flat art it
  came from, and clicking a cube says where it is in MagicaVoxel. With `pnpm avatar-art
  --watch` running, saving a model.vox updates the page. art/avatar/README.md has the steps.
*/

const LAB_USER = "avatar-lab";

/** Turning the figure by a positive angle shows its right side. */
const VIEWS = [
  ["Front", 0],
  ["Right side", Math.PI / 2],
  ["Back", Math.PI],
  ["Left side", -Math.PI / 2],
] as const;

const REACHES = {
  skin: "It takes the guest's skin tone.",
  hair: "It takes the guest's hair colour.",
  suit: "It takes the guest's suit or dress colour.",
  item: "It's part of a piece, so it keeps its colour.",
};

function describe(cube: PickedCube) {
  // MagicaVoxel is z up and looks at the front along +y. See scripts/avatar-3d.ts.
  const where = `x ${cube.col}, y ${15 - cube.z}, z ${63 - cube.row}`;
  const reach = cube.tag === null ? "It keeps its colour." : REACHES[cube.tag];
  return `${cube.part}, at ${where} in MagicaVoxel, ${cube.colour}. ${reach}`;
}

export function AvatarLab() {
  const { colours } = useAvatarColours(LAB_USER);
  const who = CHARACTERS[colours.character];
  const [off, setOff] = useState<readonly PieceKey[]>([]);
  const worn = useMemo(
    () => who.pieces.map((piece) => piece.key).filter((key) => !off.includes(key)),
    [who, off],
  );
  const flat = useMemo(() => {
    const layers = who.pieces.filter((piece) => worn.includes(piece.key)).map((p) => p.layer);
    return toDataUrl(recolour(composite(who.body, layers), colours));
  }, [who, worn, colours]);
  const [picked, setPicked] = useState<PickedCube | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const pressed = useRef({ x: 0, y: 0 });

  const view = useRef(0);
  // A save of model.vox under `pnpm avatar-art --watch` rewrites voxel-data.ts, and Fast
  // Refresh hands this a new array. The world is built again from it, facing the same way.
  const figures = VOXEL_FIGURES;
  useEffect(() => {
    if (!host.current) return;
    const created = createWorld(host.current, { still: true });
    created.turnTo(view.current);
    world.current = created;
    return () => {
      created.dispose();
      world.current = null;
    };
  }, [figures]);

  useEffect(() => {
    world.current?.setOutfit(worn, colours, []);
  }, [worn, colours, figures]);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-[1fr_22rem]">
      <section aria-label="The figure in 3D">
        <h1 className="text-2xl font-semibold">Avatar lab</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {VIEWS.map(([label, angle]) => (
            <Button
              key={label}
              variant="outline"
              onClick={() => {
                view.current = angle;
                world.current?.turnTo(angle);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div
          ref={host}
          className="mt-4 h-[36rem] rounded-lg border border-border"
          onPointerDown={(e) => {
            pressed.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const moved = Math.hypot(e.clientX - pressed.current.x, e.clientY - pressed.current.y);
            if (moved < 5) setPicked(world.current?.cubeAt(e.clientX, e.clientY) ?? null);
          }}
        />
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {picked
            ? describe(picked)
            : "Drag to turn. Click a cube to see where it is in MagicaVoxel."}
        </p>
      </section>
      <aside className="space-y-6">
        <img
          src={flat}
          alt="The flat art the figure is built from"
          className="mx-auto size-48 [image-rendering:pixelated]"
        />
        <fieldset>
          <legend className="text-sm font-medium">Pieces on</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {who.pieces.map((piece) => (
              <label key={piece.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={!off.includes(piece.key)}
                  onChange={(e) =>
                    setOff((was) =>
                      e.target.checked ? was.filter((k) => k !== piece.key) : [...was, piece.key],
                    )
                  }
                />
                {piece.label}
              </label>
            ))}
          </div>
        </fieldset>
        <AvatarColourPicker userId={LAB_USER} />
      </aside>
    </main>
  );
}
