import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { useEffect, useRef, useState } from "react";

import { useGroupBoardBusy } from "@/features/groups/use-group-board";

/*
  Dragging people between groups on the organisers' board (FRO-140), with Pragmatic drag and drop.
  It uses the browser's own drag and drop, so a phone starts a drag on a long press and a swipe
  still scrolls the page. The person's menu stays the way to move someone by keyboard.

  A drop is a move from the row's own change, as the menu's is, so a refusal shows on the row.
  Each element registers once while it's mounted and reads the latest props through refs, so a
  poll that re-renders the board mid-drag doesn't drop the drag. A place knows who it holds at
  the latest poll, so someone moved by another organiser mid-drag can't be dropped where they now
  are. If that poll moves their row to another list, the row unmounts and its drop sends nothing.
*/

/** Marks the drag data as a person on this board, not text or a file from elsewhere. */
const MEMBER = Symbol("group-member");
/** Marks a drop target's data as a place on this board. */
const PLACE = Symbol("group-place");

/** A group's id, or null for the waiting list. */
type Place = string | null;

type MemberData = { [MEMBER]: true; userId: string };
type PlaceData = { [PLACE]: true; place: Place };

function isMember(data: Record<string | symbol, unknown>): data is MemberData {
  return data[MEMBER] === true;
}

function isPlace(data: Record<string | symbol, unknown>): data is PlaceData {
  return data[PLACE] === true;
}

/** Keeps the latest value for callbacks registered once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Makes a person's row draggable while no group change is pending. `onMove` gets the place it was
 * dropped on, and is never called for a drop outside a place, on their own place, or a cancelled
 * drag.
 */
export function useMemberDrag({
  userId,
  busy,
  onMove,
}: {
  userId: string;
  busy: boolean;
  onMove: (to: Place) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useLatest({ userId, busy, onMove });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return draggable({
      element,
      canDrag: () => !latest.current.busy,
      getInitialData: (): MemberData => ({ [MEMBER]: true, userId: latest.current.userId }),
      onDragStart: () => setDragging(true),
      onDrop: ({ location }) => {
        setDragging(false);
        const target = location.current.dropTargets[0]?.data;
        // A place refuses its own people and every drop while a change saves, so a target here
        // is a move. The busy check covers a change that started during the drag.
        if (!target || !isPlace(target) || latest.current.busy) return;
        latest.current.onMove(target.place);
      },
    });
  }, [latest]);

  return { ref, dragging };
}

/**
 * Marks a place a held person would move to. It changes in one frame, as the design's highlights
 * do, so no transition goes with it.
 */
export const DROP_OVER =
  "data-[drop-over]:bg-accent data-[drop-over]:outline-2 data-[drop-over]:outline-offset-2 data-[drop-over]:outline-primary-text";

/**
 * Makes a group's panel, or the waiting list, a place to drop people from elsewhere on the board,
 * while no group change is pending. `over` is true while a person who would move is held over it.
 */
export function usePlaceDrop({ place, memberIds }: { place: Place; memberIds: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);
  const latest = useLatest({ place, memberIds, busy: useGroupBoardBusy() });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        isMember(source.data) &&
        !latest.current.memberIds.includes(source.data.userId) &&
        !latest.current.busy,
      getData: (): PlaceData => ({ [PLACE]: true, place: latest.current.place }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [latest]);

  return { ref, over };
}

/** Scrolls the page near its top and bottom edges during a drag, so a phone reaches every group. */
export function useDragAutoScroll() {
  useEffect(
    () => autoScrollWindowForElements({ canScroll: ({ source }) => isMember(source.data) }),
    [],
  );
}
