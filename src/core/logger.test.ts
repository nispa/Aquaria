import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "./logger";

describe("createLogger", () => {
  it("forwards entries with level, scope and message to the sink", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("scene", (entry) => entries.push(entry));

    logger.warn("model missing", { species: "clownfish" });

    expect(entries).toEqual([
      {
        level: "warn",
        scope: "scene",
        message: "model missing",
        details: { species: "clownfish" },
      },
    ]);
  });

  it("supports info and error levels", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("app", (entry) => entries.push(entry));

    logger.info("started");
    logger.error("failed");

    expect(entries.map((entry) => entry.level)).toEqual(["info", "error"]);
  });
});
