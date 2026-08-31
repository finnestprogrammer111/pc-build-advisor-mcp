import { useEffect, useState } from "react";
import { analyzeBuild, defaultBuild, FORM_FACTORS } from "./compatibility.js";
import {
  callMcpTool,
  initializeMcpBridge,
  isInsideMcpHost,
  subscribeToToolResults,
} from "./mcpBridge.js";

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const emptyBuild = {
  cpu: { socket: "", tdpW: 0 },
  motherboard: {
    socket: "",
    memoryType: "DDR5",
    formFactor: "ATX",
    memorySlots: 4,
    m2Slots: 0,
    sataPorts: 0,
  },
  ram: { memoryType: "DDR5", modules: 2 },
  gpu: { lengthMm: 0, tdpW: 0, requiredPcieConnectors: 0 },
  case: {
    supportedFormFactors: ["Mini-ITX", "Micro-ATX", "ATX"],
    maxGpuLengthMm: 0,
    maxCoolerHeightMm: 0,
  },
  cooler: { heightMm: 0, supportedSockets: [] },
  psu: { wattage: 0, pcieConnectors: 0 },
  storage: { m2Drives: 0, sataDrives: 0 },
  extraPowerW: 100,
};

const verdictMeta = {
  compatible: { label: "COMPATIBLE", icon: "✓", tone: "good" },
  "needs-review": { label: "REVIEW NEEDED", icon: "!", tone: "warn" },
  incompatible: { label: "INCOMPATIBLE", icon: "×", tone: "bad" },
};

function Panel({ eyebrow, title, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="field-grid">{children}</div>
    </section>
  );
}

function Field({ label, hint, value, onChange, type = "text", min = 0, suffix }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <input
          type={type}
          min={type === "number" ? min : undefined}
          value={value}
          onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell select-shell">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      </span>
    </label>
  );
}

function ResultPanel({ result }) {
  if (!result) {
    return (
      <aside className="result-panel result-empty">
        <div className="scan-mark"><span /><span /><span /></div>
        <p>Enter the component specifications, then run the compatibility check.</p>
      </aside>
    );
  }

  const meta = verdictMeta[result.verdict];
  return (
    <aside className={`result-panel result-${meta.tone}`} aria-live="polite">
      <div className="verdict-row">
        <div className={`verdict-icon ${meta.tone}`}>{meta.icon}</div>
        <div>
          <span className="eyebrow">BUILD VERDICT</span>
          <h2>{meta.label}</h2>
        </div>
        <div className="score" aria-label={`Compatibility score ${result.score} out of 100`}>
          <strong>{result.score}</strong><span>/100</span>
        </div>
      </div>

      <p className="summary">{result.summary}</p>

      <div className="power-grid">
        <div><span>Estimated load</span><strong>{result.stats.estimatedLoadW} W</strong></div>
        <div><span>Recommended PSU</span><strong>{result.stats.recommendedPsuW} W</strong></div>
        <div><span>Selected headroom</span><strong>{result.stats.selectedHeadroomW} W</strong></div>
      </div>

      <div className="issue-heading">
        <h3>Compatibility report</h3>
        <span>{result.stats.checkedRules} checks</span>
      </div>

      {result.issues.length === 0 ? (
        <div className="all-clear">All supplied specifications passed.</div>
      ) : (
        <div className="issue-list">
          {result.issues.map((item) => (
            <article className={`issue issue-${item.severity}`} key={item.code}>
              <span className="issue-symbol">{item.severity === "error" ? "×" : "!"}</span>
              <div>
                <strong>{item.component}</strong>
                <p>{item.message}</p>
                <small>{item.fix}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

export default function PcBuildAdvisor() {
  const [build, setBuild] = useState(() => deepClone(defaultBuild));
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const update = (section, key, value) => {
    setBuild((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
    setResult(null);
    setError("");
  };

  const updateRoot = (key, value) => {
    setBuild((current) => ({ ...current, [key]: value }));
    setResult(null);
    setError("");
  };

  const applyToolResult = (response) => {
    const analysis = response?.structuredContent;
    if (!analysis?.verdict) return;
    setResult(analysis);
    setChecking(false);
    setError("");
  };

  useEffect(() => {
    const unsubscribe = subscribeToToolResults(applyToolResult);
    initializeMcpBridge().catch((bridgeError) => {
      console.warn("MCP Apps bridge was not initialized:", bridgeError);
    });
    return unsubscribe;
  }, []);

  const toggleFormFactor = (formFactor) => {
    const current = build.case.supportedFormFactors;
    const next = current.includes(formFactor)
      ? current.filter((item) => item !== formFactor)
      : [...current, formFactor];
    update("case", "supportedFormFactors", next);
  };

  const checkBuild = async () => {
    setChecking(true);
    setError("");
    try {
      if (isInsideMcpHost()) {
        const response = await callMcpTool("check_pc_compatibility", { build });
        applyToolResult(response);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 220));
        setResult(analyzeBuild(build));
        setChecking(false);
      }
    } catch (checkError) {
      console.error("Compatibility check failed:", checkError);
      setChecking(false);
      setError("The compatibility check could not run. Check the MCP connection and try again.");
    }
  };

  const loadBuild = (value) => {
    setBuild(deepClone(value));
    setResult(null);
    setError("");
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <span className="eyebrow">MCP HARDWARE LAB</span>
          <h1>PC BUILD <em>ADVISOR</em></h1>
          <p>Catch compatibility problems before buying the parts.</p>
        </div>
        <div className="mode-pill">{isInsideMcpHost() ? "CHATGPT APP" : "BROWSER MODE"}</div>
      </header>

      <div className="toolbar">
        <button className="ghost-button" type="button" onClick={() => loadBuild(defaultBuild)}>Load example</button>
        <button className="ghost-button" type="button" onClick={() => loadBuild(emptyBuild)}>Clear fields</button>
        <span>All dimensions use millimetres. Power values use watts.</span>
      </div>

      <div className="workspace">
        <div className="form-column">
          <Panel eyebrow="01" title="Processor & motherboard">
            <Field label="CPU socket" hint="Example: AM5 or LGA1700" value={build.cpu.socket} onChange={(value) => update("cpu", "socket", value)} />
            <Field label="CPU power" value={build.cpu.tdpW} onChange={(value) => update("cpu", "tdpW", value)} type="number" suffix="W" />
            <Field label="Motherboard socket" value={build.motherboard.socket} onChange={(value) => update("motherboard", "socket", value)} />
            <SelectField label="Motherboard size" value={build.motherboard.formFactor} onChange={(value) => update("motherboard", "formFactor", value)} options={FORM_FACTORS} />
          </Panel>

          <Panel eyebrow="02" title="Memory & storage">
            <SelectField label="Motherboard memory" value={build.motherboard.memoryType} onChange={(value) => update("motherboard", "memoryType", value)} options={["DDR4", "DDR5"]} />
            <SelectField label="RAM memory" value={build.ram.memoryType} onChange={(value) => update("ram", "memoryType", value)} options={["DDR4", "DDR5"]} />
            <Field label="RAM slots" value={build.motherboard.memorySlots} onChange={(value) => update("motherboard", "memorySlots", value)} type="number" />
            <Field label="RAM modules" value={build.ram.modules} onChange={(value) => update("ram", "modules", value)} type="number" />
            <Field label="M.2 slots" value={build.motherboard.m2Slots} onChange={(value) => update("motherboard", "m2Slots", value)} type="number" />
            <Field label="M.2 drives" value={build.storage.m2Drives} onChange={(value) => update("storage", "m2Drives", value)} type="number" />
            <Field label="SATA ports" value={build.motherboard.sataPorts} onChange={(value) => update("motherboard", "sataPorts", value)} type="number" />
            <Field label="SATA drives" value={build.storage.sataDrives} onChange={(value) => update("storage", "sataDrives", value)} type="number" />
          </Panel>

          <Panel eyebrow="03" title="Graphics & case clearance">
            <Field label="GPU length" value={build.gpu.lengthMm} onChange={(value) => update("gpu", "lengthMm", value)} type="number" suffix="mm" />
            <Field label="Case GPU limit" value={build.case.maxGpuLengthMm} onChange={(value) => update("case", "maxGpuLengthMm", value)} type="number" suffix="mm" />
            <Field label="Cooler height" value={build.cooler.heightMm} onChange={(value) => update("cooler", "heightMm", value)} type="number" suffix="mm" />
            <Field label="Case cooler limit" value={build.case.maxCoolerHeightMm} onChange={(value) => update("case", "maxCoolerHeightMm", value)} type="number" suffix="mm" />
            <label className="field wide-field">
              <span className="field-label">Case motherboard support</span>
              <span className="choice-row">
                {FORM_FACTORS.map((formFactor) => (
                  <button
                    type="button"
                    key={formFactor}
                    className={build.case.supportedFormFactors.includes(formFactor) ? "choice active" : "choice"}
                    aria-pressed={build.case.supportedFormFactors.includes(formFactor)}
                    onClick={() => toggleFormFactor(formFactor)}
                  >
                    {formFactor}
                  </button>
                ))}
              </span>
            </label>
            <Field
              label="Cooler sockets"
              hint="Comma-separated, for example AM5, AM4"
              value={build.cooler.supportedSockets.join(", ")}
              onChange={(value) => update("cooler", "supportedSockets", value.split(",").map((item) => item.trim()).filter(Boolean))}
            />
          </Panel>

          <Panel eyebrow="04" title="Power supply">
            <Field label="GPU power" value={build.gpu.tdpW} onChange={(value) => update("gpu", "tdpW", value)} type="number" suffix="W" />
            <Field label="Other system power" hint="Fans, drives, pumps and USB devices" value={build.extraPowerW} onChange={(value) => updateRoot("extraPowerW", value)} type="number" suffix="W" />
            <Field label="PSU capacity" value={build.psu.wattage} onChange={(value) => update("psu", "wattage", value)} type="number" suffix="W" />
            <Field label="GPU connectors needed" value={build.gpu.requiredPcieConnectors} onChange={(value) => update("gpu", "requiredPcieConnectors", value)} type="number" />
            <Field label="PSU GPU connectors" value={build.psu.pcieConnectors} onChange={(value) => update("psu", "pcieConnectors", value)} type="number" />
          </Panel>

          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="check-button" type="button" disabled={checking} onClick={checkBuild}>
            <span>{checking ? "SCANNING BUILD…" : "RUN COMPATIBILITY CHECK"}</span>
            <b>{checking ? "•••" : "→"}</b>
          </button>
        </div>

        <ResultPanel result={result} />
      </div>

      <footer>
        This tool checks supplied specifications and estimates power headroom. Always confirm final measurements, BIOS support, connectors, and power guidance with the manufacturers.
      </footer>
    </main>
  );
}
