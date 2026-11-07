/**
 * Appends each failed test's message to test-results/failures.log, which git
 * ignores. A rerun that passes leaves it in place, so a test that only fails
 * now and then can still be read about afterwards, even if the run's output
 * went through `tail` or was never looked at.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Reporter, TestModule } from "vitest/node";

const LOG_DIR = fileURLToPath(new URL("../test-results/", import.meta.url));
const LOG_FILE = `${LOG_DIR}failures.log`;

interface Failure {
  message: string;
  stack?: string;
  diff?: string;
}

function describe(error: Failure): string {
  return [error.stack ?? error.message, error.diff].filter(Boolean).join("\n");
}

export class FailureLog implements Reporter {
  onTestRunEnd(testModules: readonly TestModule[], unhandledErrors: readonly Failure[]): void {
    const entries: string[] = unhandledErrors.map((error) => `Unhandled\n${describe(error)}`);
    for (const testModule of testModules) {
      for (const error of testModule.errors()) {
        entries.push(`${testModule.moduleId}\n${describe(error)}`);
      }
      for (const test of testModule.children.allTests("failed")) {
        for (const error of test.result().errors ?? []) {
          entries.push(`${testModule.moduleId} > ${test.fullName}\n${describe(error)}`);
        }
      }
    }
    if (entries.length === 0) return;

    mkdirSync(LOG_DIR, { recursive: true });
    const header = `===== ${new Date().toISOString()}, ${entries.length} failed =====`;
    appendFileSync(LOG_FILE, `${[header, ...entries].join("\n\n")}\n\n`);
    console.log(`Failures saved to apps/event-service/test-results/failures.log`);
  }
}
