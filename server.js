import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { analyzeBuild, estimatePsuWattage } from "./src/compatibility.js";

const WIDGET_URI = "ui://widget/pc-build-advisor-v1.html";
const MCP_PATH = "/mcp";
const widgetPath = fileURLToPath(new URL("./dist/index.html", import.meta.url));
const widgetHtml = readFileSync(widgetPath, "utf8");

const nonNegativeNumber = z.number().finite().nonnegative();
const buildSchema = z.object({
  cpu: z.object({ socket: z.string(), tdpW: nonNegativeNumber }),
  motherboard: z.object({
    socket: z.string(),
    memoryType: z.string(),
    formFactor: z.string(),
    memorySlots: nonNegativeNumber,
    m2Slots: nonNegativeNumber,
    sataPorts: nonNegativeNumber,
  }),
  ram: z.object({ memoryType: z.string(), modules: nonNegativeNumber }),
  gpu: z.object({
    lengthMm: nonNegativeNumber,
    tdpW: nonNegativeNumber,
    requiredPcieConnectors: nonNegativeNumber,
  }),
  case: z.object({
    supportedFormFactors: z.array(z.string()),
    maxGpuLengthMm: nonNegativeNumber,
    maxCoolerHeightMm: nonNegativeNumber,
  }),
  cooler: z.object({
    heightMm: nonNegativeNumber,
    supportedSockets: z.array(z.string()),
  }),
  psu: z.object({ wattage: nonNegativeNumber, pcieConnectors: nonNegativeNumber }),
  storage: z.object({ m2Drives: nonNegativeNumber, sataDrives: nonNegativeNumber }),
  extraPowerW: nonNegativeNumber,
});

const issueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  component: z.string(),
  message: z.string(),
  fix: z.string(),
});

const analysisSchema = {
  verdict: z.enum(["compatible", "needs-review", "incompatible"]),
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  issues: z.array(issueSchema),
  stats: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    checkedRules: z.number().int().positive(),
    estimatedLoadW: z.number().nonnegative(),
    recommendedPsuW: z.number().nonnegative(),
    selectedPsuW: z.number().nonnegative(),
    selectedHeadroomW: z.number(),
  }),
};

function createAdvisorServer() {
  const server = new McpServer(
    { name: "pc-build-advisor", version: "1.0.0" },
    {
      instructions:
        "Use check_pc_compatibility when a user provides component specifications. Explain that results depend on supplied specs and recommend confirming BIOS support, measurements, connectors, and power guidance with manufacturers.",
    },
  );

  registerAppResource(
    server,
    "pc-build-advisor-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      }],
    }),
  );

  registerAppTool(
    server,
    "open_pc_build_advisor",
    {
      title: "Open PC Build Advisor",
      description: "Opens an interactive PC compatibility checker for entering a complete component build.",
      inputSchema: {},
      outputSchema: { ready: z.boolean() },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async () => ({
      content: [{ type: "text", text: "The PC Build Advisor is ready." }],
      structuredContent: { ready: true },
    }),
  );

  server.registerTool(
    "check_pc_compatibility",
    {
      title: "Check PC Compatibility",
      description: "Checks supplied PC component specifications for socket, memory, case, cooler, storage, connector, and PSU conflicts.",
      inputSchema: { build: buildSchema },
      outputSchema: analysisSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    async ({ build }) => {
      const analysis = analyzeBuild(build);
      const issueText = analysis.issues.length
        ? ` ${analysis.issues.map((item) => `${item.severity.toUpperCase()}: ${item.message}`).join(" ")}`
        : "";
      return {
        content: [{ type: "text", text: `${analysis.summary}${issueText}` }],
        structuredContent: analysis,
      };
    },
  );

  server.registerTool(
    "estimate_power_supply",
    {
      title: "Estimate Power Supply",
      description: "Estimates PC load and a PSU wattage target from CPU, GPU, and other system power.",
      inputSchema: {
        cpuTdpW: nonNegativeNumber,
        gpuTdpW: nonNegativeNumber,
        extraPowerW: nonNegativeNumber.default(100),
      },
      outputSchema: {
        estimatedLoadW: z.number().nonnegative(),
        recommendedWattage: z.number().nonnegative(),
        headroomW: z.number().nonnegative(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    async ({ cpuTdpW, gpuTdpW, extraPowerW = 100 }) => {
      const estimate = estimatePsuWattage({ cpuTdpW, gpuTdpW, extraPowerW });
      return {
        content: [{
          type: "text",
          text: `Estimated component load: ${estimate.estimatedLoadW} W. Recommended PSU capacity: ${estimate.recommendedWattage} W.`,
        }],
        structuredContent: estimate,
      };
    },
  );

  return server;
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

const port = Number(process.env.PORT ?? 8787);
const httpServer = createHttpServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
    setCorsHeaders(response);
    response.writeHead(204).end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(widgetHtml);
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && request.method && mcpMethods.has(request.method)) {
    setCorsHeaders(response);
    const server = createAdvisorServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!response.headersSent) response.writeHead(500).end("Internal server error");
    }
    return;
  }

  response.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`PC Build Advisor running at http://localhost:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}${MCP_PATH}`);
});
