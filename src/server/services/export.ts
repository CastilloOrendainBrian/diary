import type { EntryView } from "../../shared/entries.js";
import type { ExportFormat } from "../../shared/search.js";

export interface ExportOwner {
  displayName: string;
  timezone: string;
}

/**
 * Renders the user's entries as a JSON document. Entries are already ordered by date and time.
 * `exportedAt` is passed in so the output is deterministic in tests.
 */
export function renderJsonExport(
  owner: ExportOwner,
  entries: EntryView[],
  exportedAt: Date,
): string {
  return JSON.stringify(
    {
      format: "diary-export",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      owner,
      entryCount: entries.length,
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        time: entry.entryTime,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    },
    null,
    2,
  );
}

/**
 * Renders the entries as one Markdown document, grouped by day.
 * Note content is copied verbatim: it is already Markdown.
 */
export function renderMarkdownExport(
  owner: ExportOwner,
  entries: EntryView[],
  exportedAt: Date,
): string {
  const lines: string[] = [
    `# Diario de ${owner.displayName}`,
    "",
    `Exportado el ${exportedAt.toISOString().slice(0, 10)} · ${String(entries.length)} notas`,
  ];

  let currentDate: string | null = null;
  for (const entry of entries) {
    if (entry.entryDate !== currentDate) {
      currentDate = entry.entryDate;
      lines.push("", `## ${currentDate}`);
    }
    lines.push("", `### ${entry.entryTime}${entry.title ? ` · ${entry.title}` : ""}`);
    if (entry.tags.length > 0) {
      lines.push("", entry.tags.map((tag) => `#${tag}`).join(" "));
    }
    if (entry.content.trim().length > 0) {
      lines.push("", entry.content.trimEnd());
    }
  }

  return `${lines.join("\n")}\n`;
}

export function exportFileName(format: ExportFormat, today: string): string {
  return `diario-${today}.${format === "json" ? "json" : "md"}`;
}
