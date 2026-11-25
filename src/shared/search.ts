import { z } from "zod";

// Shared between the API and the browser.

/** Highlight markers used in snippets. Text between them is emphasized by the browser. */
export const HIGHLIGHT_START = "[[";
export const HIGHLIGHT_END = "]]";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "is required").max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface SearchHit {
  id: string;
  entryDate: string;
  entryTime: string;
  title: string | null;
  /** Excerpt of the content with highlight markers around matched words. */
  snippet: string;
}

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const exportQuerySchema = z.object({
  format: z.enum(["json", "md"]),
});

export type ExportFormat = z.infer<typeof exportQuerySchema>["format"];
