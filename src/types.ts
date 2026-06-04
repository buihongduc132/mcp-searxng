import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface SearXNGWeb {
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
  }>;
}

export function isSearXNGWebSearchArgs(args: unknown): args is {
  query: string;
  pageno?: number;
  categories?: string;
  time_range?: string;
  language?: string;
  safesearch?: number;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

export const WEB_SEARCH_TOOL: Tool = {
  name: "searxng_web_search",
  description:
    "Searches the web using SearXNG meta-search engine. " +
    "Aggregates results from Google, Bing, DuckDuckGo, Brave, Wikipedia and more. " +
    "CRITICAL: The parameter name MUST be exactly `query` (not `prompt`, `q`, or any other name). " +
    "Pass your search terms as the value of the `query` parameter. " +
    "Favor to use this when: keyword-style queries, news search, category filtering, self-hosted (no API key, no rate limit).",
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The search query string. This is the required parameter name — use exactly `query`, not `prompt` or `q`.",
      },
      pageno: {
        type: "number",
        description: "Search page number (starts at 1)",
        default: 1,
      },
      categories: {
        type: "string",
        description: "Comma-separated categories: general, news, images, videos, it, science, files, social media. Default: general.",
      },
      time_range: {
        type: "string",
        description: "Time range of search (day, week, month, year)",
        enum: ["day", "week", "month", "year"],
      },
      language: {
        type: "string",
        description:
          "Language code for search results (e.g., 'en', 'fr', 'de'). Default is instance-dependent.",
        default: "all",
      },
      safesearch: {
        type: "number",
        description:
          "Safe search filter level (0: None, 1: Moderate, 2: Strict)",
        enum: [0, 1, 2],
        default: 0,
      },
    },
    required: ["query"],
  },
};

export const SEARCH_SUGGESTIONS_TOOL: Tool = {
  name: "searxng_search_suggestions",
  description:
    "Get search suggestions/autocomplete for a partial query from SearXNG. " +
    "Returns a list of suggested completions for the query prefix. " +
    "Favor to use this when: building search UX, suggesting query completions, exploring topics.",
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Partial search query to get suggestions for.",
      },
      language: {
        type: "string",
        description: "Language code for suggestions. Default: all.",
        default: "all",
      },
    },
    required: ["query"],
  },
};

export const READ_URL_TOOL: Tool = {
  name: "web_url_read",
  description:
    "Read the content from an URL and convert to clean markdown. " +
    "Downloads the page, converts HTML to markdown, and returns structured text. " +
    "Supports section extraction, heading listing, and paragraph range selection. " +
    "Favor to use this when: reading a page found by web_search, extracting specific sections, getting page structure. " +
    "Use this for further information retrieving to understand the content of each URL.",
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL",
      },
      startChar: {
        type: "number",
        description: "Starting character position for content extraction (default: 0)",
        minimum: 0,
      },
      maxLength: {
        type: "number",
        description: "Maximum number of characters to return",
        minimum: 1,
      },
      section: {
        type: "string",
        description: "Extract content under a specific heading (searches for heading text)",
      },
      paragraphRange: {
        type: "string",
        description: "Return specific paragraph ranges (e.g., '1-5', '3', '10-')",
      },
      readHeadings: {
        type: "boolean",
        description: "Return only a list of headings instead of full content",
      },
    },
    required: ["url"],
  },
};
