import { useId, useMemo } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CHARACTERS, type CharacterKey } from "@/features/passport/avatar/art";
import {
  CHARACTER_CHOICES,
  coloursFor,
  HAIR_COLOURS,
  recolour,
  SKIN_TONES,
  SUIT_COLOURS,
  type AvatarColours,
} from "@/features/passport/avatar/avatar-colours";
import { toDataUrl } from "@/features/passport/avatar/layers";
import { useAvatarColours } from "@/features/passport/avatar/use-avatar-colours";
import { cn } from "@/lib/utils";

interface Swatch {
  key: string;
  label: string;
  main: string;
}

/** A dark swatch gets a light dot when chosen, a light one a dark dot, so the choice shows on any. */
function isDark(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma < 140;
}

function SwatchRow<Key extends string>({
  label,
  swatches,
  value,
  onChange,
}: {
  label: string;
  swatches: readonly (Swatch & { key: Key })[];
  value: Key;
  onChange: (key: Key) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="text-sm font-medium">
        {label}
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          const swatch = swatches.find((candidate) => candidate.key === next);
          if (swatch) onChange(swatch.key);
        }}
        className="mt-2 flex flex-wrap gap-2.5"
      >
        {swatches.map((swatch) => (
          <RadioGroupItem
            key={swatch.key}
            value={swatch.key}
            aria-label={swatch.label}
            title={swatch.label}
            style={{ backgroundColor: swatch.main }}
            className={cn(
              "size-9 border-border ring-offset-2 ring-offset-background data-[state=checked]:ring-2 data-[state=checked]:ring-ring",
              isDark(swatch.main) ? "text-white" : "text-black",
            )}
          />
        ))}
      </RadioGroup>
    </div>
  );
}

/** Each character as drawn, as a small picture to pick. */
function CharacterRow({
  value,
  onChange,
}: {
  value: CharacterKey;
  onChange: (key: CharacterKey) => void;
}) {
  const labelId = useId();
  const pictures = useMemo(
    () =>
      Object.fromEntries(
        CHARACTER_CHOICES.map(({ key }) => [
          key,
          toDataUrl(recolour(CHARACTERS[key].body, coloursFor(key))),
        ]),
      ),
    [],
  );
  return (
    <div>
      <p id={labelId} className="text-sm font-medium">
        Character
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          const choice = CHARACTER_CHOICES.find((candidate) => candidate.key === next);
          if (choice) onChange(choice.key);
        }}
        className="mt-2 flex gap-2.5"
      >
        {CHARACTER_CHOICES.map((choice) => (
          <RadioGroupItem
            key={choice.key}
            value={choice.key}
            aria-label={choice.label}
            title={choice.label}
            style={{ backgroundImage: `url(${pictures[choice.key]})` }}
            className="size-16 rounded-lg border-border bg-muted bg-contain bg-center bg-no-repeat ring-offset-2 ring-offset-background [image-rendering:pixelated] data-[state=checked]:ring-2 data-[state=checked]:ring-ring [&>span]:hidden"
          />
        ))}
      </RadioGroup>
    </div>
  );
}

/**
 * The guest's character, skin tone, hair colour and suit colour (FRO-105). A pick applies at
 * once and stays in this browser. Picking a character starts from that character's colours.
 * It sits beside "What should we call you?" and under the avatar.
 */
export function AvatarColourPicker({ userId }: { userId: string }) {
  const { colours, setColours } = useAvatarColours(userId);
  const set = (change: Partial<AvatarColours>) => setColours({ ...colours, ...change });
  return (
    <div className="space-y-4">
      <CharacterRow
        value={colours.character}
        onChange={(character) => setColours(coloursFor(character))}
      />
      <SwatchRow
        label="Skin tone"
        swatches={SKIN_TONES}
        value={colours.skin}
        onChange={(skin) => set({ skin })}
      />
      <SwatchRow
        label="Hair"
        swatches={HAIR_COLOURS}
        value={colours.hair}
        onChange={(hair) => set({ hair })}
      />
      <SwatchRow
        label={CHARACTERS[colours.character].outfit}
        swatches={SUIT_COLOURS}
        value={colours.suit}
        onChange={(suit) => set({ suit })}
      />
    </div>
  );
}
