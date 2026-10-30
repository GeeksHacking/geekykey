/**
 * Where a row dialog sends the keyboard when it closes (FRO-99). Radix returns focus to a
 * `DialogTrigger`, and the board opens its row dialogs from state instead, so without this a
 * keyboard or screen reader user lands on `<body>` and starts again at the top of the page.
 *
 * A save can replace the button that opened the dialog, as disabling a station swaps Disable
 * for Enable, and a new element cannot take the old one's focus. Then the row's power button is
 * the target, found by the station id the row carries as `data-station-id`. A save can also
 * only rename the button, as Set booth becomes Change booth, and that keeps the element.
 */
export function returnFocusOnClose(
  event: Event,
  opener: HTMLElement | null,
  stationId: string,
): void {
  const target = opener?.isConnected ? opener : rowPowerButton(stationId);
  // Nothing to focus, as when a poll dropped the row: the dialog closes as it did before.
  if (!target) return;
  event.preventDefault();
  target.focus();
}

function rowPowerButton(stationId: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>("tr[data-station-id]")) {
    if (row.dataset.stationId === stationId) {
      return row.querySelector<HTMLElement>("[data-station-power]");
    }
  }
  return null;
}
