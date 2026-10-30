import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * For tests. Since FRO-100 a row's actions sit in its Station settings menu, so a test reaches
 * one the way an organiser does: open the menu named for the station, then pick the action.
 */
export async function openStationSettings(user: UserEvent, station: string) {
  // Several fixture stations share a label, so this takes the first row that matches.
  const [trigger] = await screen.findAllByRole("button", {
    name: `Station settings for ${station}`,
  });
  if (!trigger) throw new Error(`no Station settings for ${station}`);
  await user.click(trigger);
  await screen.findByRole("menu");
  return trigger;
}

/** Opens the row's menu and picks `action`, by its wording on the menu. Returns the trigger. */
export async function pickStationAction(user: UserEvent, station: string, action: string) {
  const trigger = await openStationSettings(user, station);
  await user.click(screen.getByRole("menuitem", { name: action }));
  return trigger;
}
