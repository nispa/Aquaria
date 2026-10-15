import { describe, expect, it } from "vitest";
import { versionLabel } from "./version";

describe("versionLabel", () => {
  it("shows the release and the commit it was built from", () => {
    expect(versionLabel("1.0.1", "9b2d5f7")).toBe("v1.0.1 · 9b2d5f7");
  });

  it("shows only the release when the commit is unknown", () => {
    expect(versionLabel("1.0.1", "")).toBe("v1.0.1");
  });
});
