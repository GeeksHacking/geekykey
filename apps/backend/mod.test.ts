import { add } from "./mod.ts";

Deno.test("add returns the sum of two numbers", () => {
  if (add(2, 3) !== 5) {
    throw new Error("add should return the sum of its arguments");
  }
});
