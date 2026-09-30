import { describe, expect, it } from "vitest";
import { classifyGpu, shortGpuName } from "./gpu";

describe("classifyGpu", () => {
  it.each([
    [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "dedicated",
    ],
    ["ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)", "dedicated"],
    [
      "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "integrated",
    ],
    ["ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "integrated"],
    ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "software"],
    ["Apple M3 Pro", "unknown"],
  ])("classifies %s as %s", (name, kind) => {
    expect(classifyGpu(name)).toBe(kind);
  });
});

describe("shortGpuName", () => {
  it("keeps just the device name from an ANGLE renderer string", () => {
    expect(
      shortGpuName(
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("NVIDIA GeForce RTX 4070 Laptop GPU");
  });

  it("leaves other renderer strings as they are", () => {
    expect(shortGpuName("Apple M3 Pro")).toBe("Apple M3 Pro");
  });
});
