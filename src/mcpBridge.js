let rpcId = 0;
const pendingRequests = new Map();
const listeners = new Set();
let initializedPromise;

export const isInsideMcpHost = () => window.parent !== window;

function rpcNotify(method, params) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function rpcRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pendingRequests.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;

  if (typeof message.id === "number") {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.error) pending.reject(message.error);
    else pending.resolve(message.result);
    return;
  }

  if (message.method === "ui/notifications/tool-result") {
    for (const listener of listeners) listener(message.params);
  }
});

export function initializeMcpBridge() {
  if (!isInsideMcpHost()) return Promise.resolve(false);
  if (!initializedPromise) {
    initializedPromise = rpcRequest("ui/initialize", {
      appInfo: { name: "pc-build-advisor-widget", version: "1.0.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    }).then(() => {
      rpcNotify("ui/notifications/initialized", {});
      return true;
    });
  }
  return initializedPromise;
}

export function subscribeToToolResults(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function callMcpTool(name, arguments_) {
  const connected = await initializeMcpBridge();
  if (!connected) throw new Error("The MCP Apps host is not available.");
  return rpcRequest("tools/call", { name, arguments: arguments_ });
}
