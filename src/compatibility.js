export const FORM_FACTORS = ["Mini-ITX", "Micro-ATX", "ATX", "E-ATX"];

export const defaultBuild = {
  cpu: { socket: "AM5", tdpW: 120 },
  motherboard: {
    socket: "AM5",
    memoryType: "DDR5",
    formFactor: "ATX",
    memorySlots: 4,
    m2Slots: 3,
    sataPorts: 4,
  },
  ram: { memoryType: "DDR5", modules: 2 },
  gpu: { lengthMm: 300, tdpW: 285, requiredPcieConnectors: 2 },
  case: {
    supportedFormFactors: ["Mini-ITX", "Micro-ATX", "ATX"],
    maxGpuLengthMm: 360,
    maxCoolerHeightMm: 170,
  },
  cooler: { heightMm: 160, supportedSockets: ["AM5"] },
  psu: { wattage: 850, pcieConnectors: 3 },
  storage: { m2Drives: 2, sataDrives: 1 },
  extraPowerW: 100,
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const normalized = (value) => String(value ?? "").trim().toUpperCase();

const roundUpTo50 = (value) => Math.ceil(value / 50) * 50;

function issue(severity, code, component, message, fix) {
  return { severity, code, component, message, fix };
}

function missingText(issues, value, component, label) {
  if (normalized(value)) return false;
  issues.push(issue(
    "warning",
    `missing_${component}_${label}`,
    component,
    `${label.replaceAll("_", " ")} was not provided.`,
    `Enter the ${label.replaceAll("_", " ")} to complete this check.`,
  ));
  return true;
}

function invalidNumber(issues, value, component, label) {
  const number = finiteNumber(value);
  if (number !== null && number >= 0) return number;
  issues.push(issue(
    "error",
    `invalid_${component}_${label}`,
    component,
    `${label.replaceAll("_", " ")} must be zero or a positive number.`,
    `Correct the ${label.replaceAll("_", " ")} specification.`,
  ));
  return 0;
}

export function estimatePsuWattage({ cpuTdpW, gpuTdpW, extraPowerW = 100 }) {
  const cpu = Math.max(0, finiteNumber(cpuTdpW) ?? 0);
  const gpu = Math.max(0, finiteNumber(gpuTdpW) ?? 0);
  const extra = Math.max(0, finiteNumber(extraPowerW) ?? 0);
  const estimatedLoadW = cpu + gpu + extra;
  const recommendedWattage = Math.max(450, roundUpTo50(estimatedLoadW * 1.35));
  return {
    estimatedLoadW,
    recommendedWattage,
    headroomW: recommendedWattage - estimatedLoadW,
  };
}

export function analyzeBuild(input) {
  const build = clone(input ?? {});
  const issues = [];

  build.cpu ??= {};
  build.motherboard ??= {};
  build.ram ??= {};
  build.gpu ??= {};
  build.case ??= {};
  build.cooler ??= {};
  build.psu ??= {};
  build.storage ??= {};

  const cpuSocketMissing = missingText(issues, build.cpu.socket, "cpu", "socket");
  const boardSocketMissing = missingText(issues, build.motherboard.socket, "motherboard", "socket");
  if (!cpuSocketMissing && !boardSocketMissing && normalized(build.cpu.socket) !== normalized(build.motherboard.socket)) {
    issues.push(issue(
      "error",
      "cpu_socket_mismatch",
      "CPU / motherboard",
      `CPU socket ${build.cpu.socket} does not match motherboard socket ${build.motherboard.socket}.`,
      "Choose a CPU and motherboard that use the same socket.",
    ));
  }

  const boardMemoryMissing = missingText(issues, build.motherboard.memoryType, "motherboard", "memory_type");
  const ramMemoryMissing = missingText(issues, build.ram.memoryType, "ram", "memory_type");
  if (!boardMemoryMissing && !ramMemoryMissing && normalized(build.motherboard.memoryType) !== normalized(build.ram.memoryType)) {
    issues.push(issue(
      "error",
      "memory_type_mismatch",
      "RAM / motherboard",
      `${build.ram.memoryType} memory cannot be installed in a ${build.motherboard.memoryType} motherboard.`,
      "Choose RAM that matches the motherboard memory generation.",
    ));
  }

  const boardFormFactorMissing = missingText(issues, build.motherboard.formFactor, "motherboard", "form_factor");
  const caseFormFactors = Array.isArray(build.case.supportedFormFactors)
    ? build.case.supportedFormFactors.map(normalized)
    : [];
  if (!caseFormFactors.length) {
    issues.push(issue(
      "warning",
      "missing_case_form_factors",
      "Case",
      "Supported motherboard sizes were not provided.",
      "Select every motherboard form factor supported by the case.",
    ));
  } else if (!boardFormFactorMissing && !caseFormFactors.includes(normalized(build.motherboard.formFactor))) {
    issues.push(issue(
      "error",
      "motherboard_case_mismatch",
      "Motherboard / case",
      `${build.motherboard.formFactor} is not listed as supported by the case.`,
      "Choose a larger case or a smaller motherboard.",
    ));
  }

  const gpuLength = invalidNumber(issues, build.gpu.lengthMm, "gpu", "length_mm");
  const maxGpuLength = invalidNumber(issues, build.case.maxGpuLengthMm, "case", "max_gpu_length_mm");
  if (gpuLength > maxGpuLength) {
    issues.push(issue(
      "error",
      "gpu_too_long",
      "GPU / case",
      `The ${gpuLength} mm GPU exceeds the case limit by ${gpuLength - maxGpuLength} mm.`,
      "Choose a shorter graphics card or a case with more GPU clearance.",
    ));
  }

  const coolerHeight = invalidNumber(issues, build.cooler.heightMm, "cooler", "height_mm");
  const maxCoolerHeight = invalidNumber(issues, build.case.maxCoolerHeightMm, "case", "max_cooler_height_mm");
  if (coolerHeight > maxCoolerHeight) {
    issues.push(issue(
      "error",
      "cooler_too_tall",
      "Cooler / case",
      `The ${coolerHeight} mm cooler exceeds the case limit by ${coolerHeight - maxCoolerHeight} mm.`,
      "Choose a shorter cooler or a case with greater cooler clearance.",
    ));
  }

  const supportedCoolerSockets = Array.isArray(build.cooler.supportedSockets)
    ? build.cooler.supportedSockets.map(normalized)
    : [];
  if (!supportedCoolerSockets.length) {
    issues.push(issue(
      "warning",
      "missing_cooler_sockets",
      "CPU cooler",
      "The cooler socket support list is empty.",
      "Confirm that the cooler includes mounting hardware for the CPU socket.",
    ));
  } else if (!cpuSocketMissing && !supportedCoolerSockets.includes(normalized(build.cpu.socket))) {
    issues.push(issue(
      "error",
      "cooler_socket_mismatch",
      "CPU / cooler",
      `The cooler does not list ${build.cpu.socket} support.`,
      "Choose a compatible cooler or obtain the correct mounting kit.",
    ));
  }

  const memorySlots = invalidNumber(issues, build.motherboard.memorySlots, "motherboard", "memory_slots");
  const memoryModules = invalidNumber(issues, build.ram.modules, "ram", "modules");
  if (memoryModules > memorySlots) {
    issues.push(issue(
      "error",
      "too_many_memory_modules",
      "RAM / motherboard",
      `${memoryModules} memory modules cannot fit in ${memorySlots} motherboard slots.`,
      "Use fewer modules or a motherboard with more memory slots.",
    ));
  }

  const m2Slots = invalidNumber(issues, build.motherboard.m2Slots, "motherboard", "m2_slots");
  const m2Drives = invalidNumber(issues, build.storage.m2Drives, "storage", "m2_drives");
  if (m2Drives > m2Slots) {
    issues.push(issue(
      "error",
      "too_many_m2_drives",
      "Storage / motherboard",
      `${m2Drives} M.2 drives exceed the motherboard's ${m2Slots} M.2 slots.`,
      "Use fewer M.2 drives or add a compatible PCIe expansion card.",
    ));
  }

  const sataPorts = invalidNumber(issues, build.motherboard.sataPorts, "motherboard", "sata_ports");
  const sataDrives = invalidNumber(issues, build.storage.sataDrives, "storage", "sata_drives");
  if (sataDrives > sataPorts) {
    issues.push(issue(
      "error",
      "too_many_sata_drives",
      "Storage / motherboard",
      `${sataDrives} SATA drives exceed the motherboard's ${sataPorts} SATA ports.`,
      "Use fewer SATA drives or add a compatible SATA controller.",
    ));
  }

  const requiredConnectors = invalidNumber(issues, build.gpu.requiredPcieConnectors, "gpu", "pcie_power_connectors");
  const availableConnectors = invalidNumber(issues, build.psu.pcieConnectors, "psu", "pcie_power_connectors");
  if (requiredConnectors > availableConnectors) {
    issues.push(issue(
      "error",
      "insufficient_gpu_connectors",
      "GPU / power supply",
      `The GPU needs ${requiredConnectors} PCIe power connectors, but the PSU provides ${availableConnectors}.`,
      "Choose a PSU with enough native GPU power connectors.",
    ));
  }

  const cpuTdpW = invalidNumber(issues, build.cpu.tdpW, "cpu", "tdp_w");
  const gpuTdpW = invalidNumber(issues, build.gpu.tdpW, "gpu", "tdp_w");
  const extraPowerW = invalidNumber(issues, build.extraPowerW, "system", "extra_power_w");
  const psuWattage = invalidNumber(issues, build.psu.wattage, "psu", "wattage");
  const power = estimatePsuWattage({ cpuTdpW, gpuTdpW, extraPowerW });

  if (psuWattage < power.estimatedLoadW) {
    issues.push(issue(
      "error",
      "psu_below_estimated_load",
      "Power supply",
      `The ${psuWattage} W PSU is below the estimated ${power.estimatedLoadW} W component load.`,
      `Use at least the recommended ${power.recommendedWattage} W PSU.`,
    ));
  } else if (psuWattage < power.recommendedWattage) {
    issues.push(issue(
      "warning",
      "psu_low_headroom",
      "Power supply",
      `The ${psuWattage} W PSU may run this build, but it is below the ${power.recommendedWattage} W recommendation.`,
      "Choose a higher-wattage quality PSU for transient spikes and future upgrades.",
    ));
  }

  const errors = issues.filter(({ severity }) => severity === "error").length;
  const warnings = issues.filter(({ severity }) => severity === "warning").length;
  const verdict = errors ? "incompatible" : warnings ? "needs-review" : "compatible";
  const score = Math.max(0, 100 - (errors * 25) - (warnings * 8));
  const summary = verdict === "compatible"
    ? "No compatibility problems were found with the supplied specifications."
    : verdict === "needs-review"
      ? "The build has no confirmed conflicts, but some specifications need review."
      : `${errors} compatibility conflict${errors === 1 ? "" : "s"} must be fixed.`;

  return {
    verdict,
    score,
    summary,
    issues,
    stats: {
      errors,
      warnings,
      checkedRules: 11,
      estimatedLoadW: power.estimatedLoadW,
      recommendedPsuW: power.recommendedWattage,
      selectedPsuW: psuWattage,
      selectedHeadroomW: psuWattage - power.estimatedLoadW,
    },
  };
}
