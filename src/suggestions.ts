import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createProxyAgent, createDefaultAgent, ProxyType } from "./proxy.js";
import { logMessage } from "./logging.js";

export async function performSearchSuggestions(
  mcpServer: McpServer,
  query: string,
  language: string = "all"
): Promise<string[]> {
  const startTime = Date.now();
  logMessage(mcpServer, "info", `Getting search suggestions for: "${query}"`);

  const searxngUrl = process.env.SEARXNG_URL;
  if (!searxngUrl) {
    throw new Error("SEARXNG_URL environment variable is not set");
  }

  const parsedUrl = new URL(searxngUrl.endsWith('/') ? searxngUrl : searxngUrl + '/');
  const url = new URL('autocompleter', parsedUrl);

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  if (language && language !== "all") {
    url.searchParams.set("language", language);
  }

  const requestOptions: RequestInit = {
    method: "GET"
  };

  // Add proxy or default dispatcher
  const proxyAgent = createProxyAgent(url.toString(), ProxyType.SEARCH);
  const dispatcher = proxyAgent ?? createDefaultAgent();
  if (dispatcher) {
    (requestOptions as any).dispatcher = dispatcher;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), requestOptions);
  } catch (error: any) {
    logMessage(mcpServer, "warning", `Failed to get suggestions: ${error.message}`);
    return []; // Graceful degradation
  }

  if (!response.ok) {
    logMessage(mcpServer, "warning", `Suggestions request failed: ${response.status}`);
    return [];
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return [];
  }

  // SearXNG autocompleter returns [query_string, [suggestions]]
  let suggestions: string[] = [];
  if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
    suggestions = data[1];
  } else if (typeof data === "object" && data !== null && Array.isArray(data.suggestions)) {
    suggestions = data.suggestions;
  }

  const duration = Date.now() - startTime;
  logMessage(mcpServer, "info", `Got ${suggestions.length} suggestions for "${query}" in ${duration}ms`);

  return suggestions;
}
