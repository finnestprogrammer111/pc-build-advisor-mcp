import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBuild, defaultBuild, estimatePsuWattage } from "../src/compatibility.js";

const copy = (value) => JSON.parse(JSON.stringify(value));

test("estimates PSU capacity with 35 percent headroom and 50 W rounding", () => {
  assert.deepEqual(
    estimatePsuWattage({ cpuTdpW: 120, gpuTdpW: 285, extraPowerW: 100 }),
    { estimatedLoadW: 505, recommendedWattage: 700, headroomW: 195 },
  );
});

test("accepts the complete example build", () => {
  const result = analyzeBuild(defaultBuild);
  assert.equal(result.verdict, "compatible");
  assert.equal(result.score, 100);
  assert.deepEqual(result.issues, []);
});

test("detects a CPU and motherboard socket mismatch", () => {
  const build = copy(defaultBuild);
  build.motherboard.socket = "LGA1700";
  const result = analyzeBuild(build);
  assert.equal(result.verdict, "incompatible");
  assert.ok(result.issues.some(({ code }) => code === "cpu_socket_mismatch"));
});

test("detects a RAM generation mismatch", () => {
  const build = copy(defaultBuild);
  build.ram.memoryType = "DDR4";
  const result = analyzeBuild(build);
  assert.ok(result.issues.some(({ code }) => code === "memory_type_mismatch"));
});

test("detects case, GPU, and cooler clearance conflicts", () => {
  const build = copy(defaultBuild);
  build.case.supportedFormFactors = ["Mini-ITX"];
  build.case.maxGpuLengthMm = 280;
  build.case.maxCoolerHeightMm = 150;
  const codes = analyzeBuild(build).issues.map(({ code }) => code);
  assert.ok(codes.includes("motherboard_case_mismatch"));
  assert.ok(codes.includes("gpu_too_long"));
  assert.ok(codes.includes("cooler_too_tall"));
});

test("detects slot and connector limits", () => {
  const build = copy(defaultBuild);
  build.ram.modules = 6;
  build.storage.m2Drives = 5;
  build.storage.sataDrives = 6;
  build.gpu.requiredPcieConnectors = 4;
  const codes = analyzeBuild(build).issues.map(({ code }) => code);
  assert.ok(codes.includes("too_many_memory_modules"));
  assert.ok(codes.includes("too_many_m2_drives"));
  assert.ok(codes.includes("too_many_sata_drives"));
  assert.ok(codes.includes("insufficient_gpu_connectors"));
});

test("warns for a PSU below the recommended headroom", () => {
  const build = copy(defaultBuild);
  build.psu.wattage = 650;
  const result = analyzeBuild(build);
  assert.equal(result.verdict, "needs-review");
  assert.ok(result.issues.some(({ code }) => code === "psu_low_headroom"));
});

test("does not mutate the supplied build", () => {
  const build = copy(defaultBuild);
  const before = JSON.stringify(build);
  analyzeBuild(build);
  assert.equal(JSON.stringify(build), before);
});
