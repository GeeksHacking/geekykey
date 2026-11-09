/** The question the clear and the restore ask before they change anything. */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

/** What the person types, or nothing if their input ends first, which stops the command too. */
export async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await Promise.race([
      prompt.question(question),
      new Promise<string>((resolve) => prompt.once("close", () => resolve(""))),
    ]);
  } finally {
    prompt.close();
  }
}
