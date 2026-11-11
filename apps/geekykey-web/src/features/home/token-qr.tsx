import { lazy, Suspense } from "react";

import { tokenAddress } from "@/lib/token-uid";

/*
  The drawing code loads only when someone shows a code, so My tokens' first load doesn't
  carry it (FRO-166).
*/
const QRCodeSVG = lazy(() =>
  import("qrcode.react").then((module) => ({ default: module.QRCodeSVG })),
);

/** The code's side in CSS pixels, which leaves a margin on a 320px phone. */
const SIZE = 224;

/**
 * A QR code of one token's address, for a phone that can't read the token by tapping
 * (FRO-166). Another person's camera opens the token page from it, as a tap would, and
 * everything after that is the same.
 *
 * The code is black on a white card in both themes, because a camera reads dark squares on
 * a light ground, and the card's padding is the quiet margin a QR code needs around it.
 * Error correction is medium: the address is short, so the squares stay large on a phone.
 */
export function TokenQr({ uid }: { uid: string }) {
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <div
        className="rounded-lg bg-white p-4"
        style={{ minWidth: SIZE + 32, minHeight: SIZE + 32 }}
      >
        <Suspense fallback={null}>
          <QRCodeSVG
            value={tokenAddress(uid)}
            size={SIZE}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            title="QR code of this token's address"
          />
        </Suspense>
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        If someone's phone can't read your token, they can scan this with their camera instead.
      </p>
    </div>
  );
}
