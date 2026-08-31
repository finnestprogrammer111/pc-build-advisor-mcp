import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defaultBuild } from "../src/compatibility.js";

const port = 8791;
const serverProcess = spawn(process.execPath, ["server.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});

async function waitUntilReady() {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timed out.")), 5_000);
    serverProcess.once("exit", (code) => reject(new Error(`Server exited early with code ${code}.`)));
    serverProcess.stdout.on("data", (chunk) => {
      if (!chunk.toString().includes("MCP endpoint")) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

const client = new Client({ name: "pc-build-advisor-smoke-test", version: "1.0.0" });

try {
  await waitUntilReady();
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ["check_pc_compatibility", "estimate_power_supply", "open_pc_build_advisor"],
  );

  const result = await client.callTool({
    name: "check_pc_compatibility",
    arguments: { build: defaultBuild },
  });
  assert.equal(result.structuredContent.verdict, "compatible");

  const estimate = await client.callTool({
    name: "estimate_power_supply",
    arguments: { cpuTdpW: 120, gpuTdpW: 285, extraPowerW: 100 },
  });
  assert.equal(estimate.structuredContent.recommendedWattage, 700);
  console.log("MCP smoke test passed: 3 tools discovered and compatibility and PSU checks succeeded.");
} finally {
  await client.close().catch(() => {});
  serverProcess.kill("SIGTERM");
}
