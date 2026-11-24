import { z } from "zod";

// Shared between the API (validation) and the browser (forms and types).

/** Time of day with minute precision, 00:00 to 23:59. */
export const ENTRY_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Longest range accepted by the list endpoint, in days. */
export const MAX_RANGE_DAYS = 400;

const tagName = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .transform((value) => value.toLowerCase());

const entryTime = z.string().regex(ENTRY_TIME_PATTERN, "must be HH:mm");
const title = z.string().trim().max(200).nullable();
const content = z.string().max(100_000);
const tags = z.array(tagName).max(10);

export const createEntrySchema = z.object({
  entryDate: z.iso.date().optional(),
  entryTime: entryTime.optional(),
  title: title.optional(),
  content: content.optional(),
  tags: tags.optional(),
});

export const updateEntrySchema = z
  .object({
    entryDate: z.iso.date(),
    entryTime: entryTime,
    title,
    content,
    tags,
  })
  .partial();

export const rangeQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((range) => range.from <= range.to, "from must not be after to")
  .refine(
    (range) => daysBetween(range.from, range.to) <= MAX_RANGE_DAYS,
    `range must not exceed ${String(MAX_RANGE_DAYS)} days`,
  );

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM"),
});

export const tagUpdateSchema = z.object({
  name: tagName,
});

/** A diary entry as returned to the browser. */
export interface EntryView {
  id: string;
  entryDate: string;
  /** HH:mm in the user's timezone. */
  entryTime: string;
  title: string | null;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TagView {
  id: number;
  name: string;
  entryCount: number;
}

export interface CalendarDay {
  date: string;
  count: number;
}

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
