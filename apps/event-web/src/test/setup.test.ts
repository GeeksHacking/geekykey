import { describe, expect, it } from "vitest";

/*
  Pragmatic's auto-scroll asks the document for the elements at a point on every frame, and its
  frame can run after a test has torn down. jsdom has no elementsFromPoint, so the missing method
  failed the whole run with an unhandled error while every test passed (FRO-165). The shared
  setup gives it one that finds nothing, because jsdom has no layout.
*/
describe("the test setup", () => {
  it("gives jsdom an elementsFromPoint that finds nothing", () => {
    expect(document.elementsFromPoint(0, 0)).toEqual([]);
  });
});
