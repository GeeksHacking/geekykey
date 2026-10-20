import {
  Briefcase,
  Camera,
  ChatsCircle,
  Cloud,
  Coffee,
  Cpu,
  GameController,
  MapPin,
  Printer,
  Robot,
  SealCheck,
  ShieldCheck,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";
import { createElement } from "react";

const RULES: ReadonlyArray<readonly [RegExp, Icon]> = [
  [/print/i, Printer],
  [/cloud|server|host/i, Cloud],
  [/hardware|lab|maker|solder/i, Cpu],
  [/mentor|lounge|help/i, ChatsCircle],
  [/career|job|hiring|recruit/i, Briefcase],
  [/photo|camera/i, Camera],
  [/desk|register|welcome|info/i, MapPin],
  [/game|arcade|play/i, GameController],
  [/food|coffee|snack|drink/i, Coffee],
  [/security|cyber|privacy/i, ShieldCheck],
  [/\bai\b|data|robot|ml\b/i, Robot],
];

/** The API has no icon field, so the passport picks a glyph from the station name. Purely cosmetic. */
function glyphFor(name: string): Icon {
  return RULES.find(([pattern]) => pattern.test(name))?.[1] ?? SealCheck;
}

interface StationGlyphProps extends IconProps {
  name: string;
}

/** Renders the icon for a station name. All Phosphor props (weight, className) pass through. */
export function StationGlyph({ name, ...iconProps }: StationGlyphProps) {
  return createElement(glyphFor(name), iconProps);
}
