import { describe, expect, it } from "vitest";
import type { EntryView } from "../../src/shared/entries.js";
import {
  exportFileName,
  renderJsonExport,
  renderMarkdownExport,
} from "../../src/server/services/export.js";

const owner = { displayName: "Ana", timezone: "Europe/Madrid" };
const exportedAt = new Date("2026-11-24T10:00:00Z");

function entry(overrides: Partial<EntryView>): EntryView {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entryDate: "2026-11-23",
    entryTime: "09:05",
    title: null,
    content: "",
    tags: [],
    createdAt: "2026-11-23T08:05:00.000Z",
    updatedAt: "2026-11-23T08:05:00.000Z",
    ...overrides,
  };
}

describe("export rendering", () => {
  it("produces JSON with owner, count and every entry field", () => {
    const json = JSON.parse(
      renderJsonExport(owner, [entry({ title: "Hola", content: "# x", tags: ["a"] })], exportedAt),
    ) as {
      entryCount: number;
      entries: { date: string; time: string; tags: string[] }[];
      exportedAt: string;
    };

    expect(json.entryCount).toBe(1);
    expect(json.exportedAt).toBe("2026-11-24T10:00:00.000Z");
    expect(json.entries[0]).toMatchObject({ date: "2026-11-23", time: "09:05", tags: ["a"] });
  });

  it("groups Markdown by day and keeps the note content verbatim", () => {
    const markdown = renderMarkdownExport(
      owner,
      [
        entry({ entryTime: "08:00", title: "Café", content: "**negrita**", tags: ["ocio"] }),
        entry({ entryDate: "2026-11-24", entryTime: "21:30", content: "" }),
      ],
      exportedAt,
    );

    expect(markdown).toContain("# Diario de Ana");
    expect(markdown).toContain("## 2026-11-23");
    expect(markdown).toContain("## 2026-11-24");
    expect(markdown).toContain("### 08:00 · Café");
    expect(markdown).toContain("#ocio");
    expect(markdown).toContain("**negrita**");
    expect(markdown.match(/## 2026-11-23/g)).toHaveLength(1);
  });

  it("names the file after the format and the day of export", () => {
    expect(exportFileName("json", "2026-11-24")).toBe("diario-2026-11-24.json");
    expect(exportFileName("md", "2026-11-24")).toBe("diario-2026-11-24.md");
  });
});
