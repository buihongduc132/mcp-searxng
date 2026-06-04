import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearXNGWeb } from "./types.js";
import { createProxyAgent, createDefaultAgent, ProxyType } from "./proxy.js";
import { logMessage } from "./logging.js";
import {
  MCPSearXNGError,
  validateEnvironment,
  createNetworkError,
  createServerError,
  createJSONError,
  createDataError,
  createNoResultsMessage,
  type ErrorContext
} from "./error-handler.js";

export async function performWebSearch(
  mcpServer: McpServer,
  query: string,
  pageno: number = 1,
  categories?: string,
  time_range?: string,
  language: string = "all",
  safesearch?: number
) {
  const startTime = Date.now();
  
  // Build detailed log message with all parameters
  const searchParams = [
    `page ${pageno}`,
    categories ? `categories: ${categories}` : null,
    `lang: ${language}`,
    time_range ? `time: ${time_range}` : null,
    safesearch ? `safesearch: ${safesearch}` : null
  ].filter(Boolean).join(", ");
  
  logMessage(mcpServer, "info", `Starting web search: "${query}" (${searchParams})`);
  
  const validationError = validateEnvironment();
  if (validationError) {
    logMessage(mcpServer, "error", "Configuration invalid");
    throw new MCPSearXNGError(validationError);
  }

  const searxngUrl = process.env.SEARXNG_URL!;
  const parsedUrl = new URL(searxngUrl.endsWith('/') ? searxngUrl : searxngUrl + '/');

  const url = new URL('search', parsedUrl);

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", pageno.toString());

  if (categories) {
    url.searchParams.set("categories", categories);
  }

  if (
    time_range !== undefined &&
    ["day", "week", "month", "year"].includes(time_range)
  ) {
    url.searchParams.set("time_range", time_range);
  }

  if (language && language !== "all") {
    url.searchParams.set("language", language);
  }

  if (safesearch !== undefined && [0, 1, 2].includes(safesearch)) {
    url.searchParams.set("safesearch", safesearch.toString());
  }

  // Prepare request options with headers
  const requestOptions: RequestInit = {
    method: "GET"
  };

  // Add proxy or default dispatcher (includes system CA certs for TLS)
  const proxyAgent = createProxyAgent(url.toString(), ProxyType.SEARCH);
  const dispatcher = proxyAgent ?? createDefaultAgent();
  if (dispatcher) {
    (requestOptions as any).dispatcher = dispatcher;
  }

  // Add basic authentication if credentials are provided
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;

  if (username && password) {
    const base64Auth = Buffer.from(`${username}:${password}`).toString('base64');
    requestOptions.headers = {
      ...requestOptions.headers,
      'Authorization': `Basic ${base64Auth}`
    };
  }

  // Add User-Agent header if configured
  const userAgent = process.env.USER_AGENT;
  if (userAgent) {
    requestOptions.headers = {
      ...requestOptions.headers,
      'User-Agent': userAgent
    };
  }

  // Fetch with enhanced error handling
  let response: Response;
  try {
    logMessage(mcpServer, "info", `Making request to: ${url.toString()}`);
    response = await fetch(url.toString(), requestOptions);
  } catch (error: any) {
    logMessage(mcpServer, "error", `Network error during search request: ${error.message}`, { query, url: url.toString() });
    const context: ErrorContext = {
      url: url.toString(),
      searxngUrl,
      proxyAgent: !!dispatcher,
      username
    };
    throw createNetworkError(error, context);
  }

  if (!response.ok) {
    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch {
      responseBody = '[Could not read response body]';
    }

    const context: ErrorContext = {
      url: url.toString(),
      searxngUrl
    };
    throw createServerError(response.status, response.statusText, responseBody, context);
  }

  // Parse JSON response
  let data: SearXNGWeb;
  try {
    data = (await response.json()) as SearXNGWeb;
  } catch (error: any) {
    let responseText: string;
    try {
      responseText = await response.text();
    } catch {
      responseText = '[Could not read response text]';
    }

    const context: ErrorContext = { url: url.toString() };
    throw createJSONError(responseText, context);
  }

  if (!data.results) {
    const context: ErrorContext = { url: url.toString(), query };
    throw createDataError(data, context);
  }

  const results = data.results.map((result) => ({
    title: result.title || "",
    content: result.content || "",
    url: result.url || "",
    score: result.score || 0,
  }));

  if (results.length === 0) {
    logMessage(mcpServer, "info", `No results found for query: "${query}"`);
    return createNoResultsMessage(query);
  }

  const duration = Date.now() - startTime;
  logMessage(mcpServer, "info", `Search completed: "${query}" (${searchParams}) - ${results.length} results in ${duration}ms`);

  return results
    .map((r) => `Title: ${r.title}\nDescription: ${r.content}\nURL: ${r.url}\nRelevance Score: ${r.score.toFixed(3)}`)
    .join("\n\n");
}

/**
 * Fetch search suggestions/autocomplete from SearXNG.
 * SearXNG's autocompleter returns: [["query prefix", ["suggestion1", "suggestion2", ...]]]
 */
export async function performSearchSuggestions(
  mcpServer: McpServer,
  query: string,
  language: string = "all"
): Promise<string> {
  logMessage(mcpServer, "info", `Fetching search suggestions for: "${query}"`);

  const validationError = validateEnvironment();
  if (validationError) {
    throw new MCPSearXNGError(validationError);
  }

  const searxngUrl = process.env.SEARXNG_URL!;
  const parsedUrl = new URL(searxngUrl.endsWith('/') ? searxngUrl : searxngUrl + '/');
  const url = new URL('autocompleter', parsedUrl);

  url.searchParams.set('q', query);
  if (language && language !== 'all') {
    url.searchParams.set('language', language);
  }

  const requestOptions: RequestInit = { method: 'GET' };
  const proxyAgent = createProxyAgent(url.toString(), ProxyType.SEARCH);
  const dispatcher = proxyAgent ?? createDefaultAgent();
  if (dispatcher) {
    (requestOptions as any).dispatcher = dispatcher;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), requestOptions);
  } catch (error: any) {
    logMessage(mcpServer, "error", `Network error during suggestions request: ${error.message}`);
    throw new MCPSearXNGError(`Failed to connect to SearXNG for suggestions: ${error.message}`);
  }

  if (!response.ok) {
    throw new MCPSearXNGError(`SearXNG suggestions returned ${response.status}: ${response.statusText}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return JSON.stringify({ suggestions: [], query });
  }

  // SearXNG autocompleter returns: ["query", ["sug1", "sug2", ...]]
  let suggestions: string[] = [];
  if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
    suggestions = data[1];
  } else if (Array.isArray(data)) {
    // Some instances return just the suggestions array
    suggestions = data;
  }

  logMessage(mcpServer, "info", `Got ${suggestions.length} suggestions for: "${query}"`);
  return JSON.stringify({ suggestions, query });
}
