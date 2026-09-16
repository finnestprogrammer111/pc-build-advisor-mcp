# PC Build Advisor MCP

[![M8ven Live Monitored](https://m8ven.ai/badge/mcp/finnestprogrammer111-pc-build-advisor-mcp-i6cia4)](https://m8ven.ai/mcp/finnestprogrammer111-pc-build-advisor-mcp-i6cia4)

An interactive PC compatibility checker that works as an MCP App inside ChatGPT and as a regular browser application.

It checks supplied component specifications for CPU socket, memory generation, motherboard and case fit, GPU and cooler clearance, RAM and storage slots, GPU power connectors, and PSU capacity.

## MCP tools

| Tool | What it does |
| --- | --- |
| `open_pc_build_advisor` | Opens the interactive compatibility checker. |
| `check_pc_compatibility` | Checks a complete build and returns structured conflicts and fixes. |
| `estimate_power_supply` | Estimates system load and a recommended PSU capacity. |

The tools remain useful without the visual component. Results depend on the specifications supplied by the user and should be confirmed against manufacturer documentation before buying hardware.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run build
npm start
```

Open <http://localhost:8787> for browser mode. The Streamable HTTP MCP endpoint is:

```text
http://localhost:8787/mcp
```

## Test

```bash
npm test
npm run build
npm run smoke
```

Use MCP Inspector for direct protocol testing:

```bash
npx @modelcontextprotocol/inspector@latest
```

Choose **Streamable HTTP** and connect to `http://localhost:8787/mcp`.

## Deploy

The included `render.yaml` and Dockerfile define a Render web service with a `/health` check. After deployment, connect ChatGPT to the public HTTPS URL ending in `/mcp`.

## Project structure

```text
src/PcBuildAdvisor.jsx       React interface
src/compatibility.js         Compatibility and PSU rules
src/mcpBridge.js             MCP Apps UI bridge
server.js                    Streamable HTTP MCP server
test/compatibility.test.js   Rule tests
scripts/smoke-test.js        End-to-end MCP test
```

## Current scope

Version 1 evaluates specifications entered by the user. A live parts catalog, current prices, BIOS databases, and region-specific shopping recommendations require maintained external data sources and are planned separately.

## License

MIT
