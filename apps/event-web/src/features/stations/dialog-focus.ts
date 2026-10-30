/**
 * Where a row dialog sends the keyboard when it closes (FRO-99). Radix returns focus to a
 * `DialogTrigger`, and the board opens its row dialogs from state instead, so without this a
 * keyboard or screen reader user lands on `<body>` and starts again at the top of the page.
 *
 * The opener is the row's Station settings button (FRO-100). A save can rename it, as adding
 * passport settings renames the station, but never replaces it, so it can always take the
 * keyboard back while its row is on the board.
 */
export function returnFocusOnClose(event: Event, opener: HTMLElement | null): void {
  // Nothing to focus, as when a poll dropped the row: the dialog closes as it did before.
  if (!opener?.isConnected) return;
  event.preventDefault();
  opener.focus();
}
