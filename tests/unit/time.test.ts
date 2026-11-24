import { describe, expect, it } from "vitest";
import { currentTimeIn, todayIn } from "../../src/shared/time.js";
import {
  addDays,
  daysInMonth,
  nextMonthStart,
  toMinutePrecision,
  weekdayOf,
} from "../../src/shared/time.js";

describe("timezone-aware clock helpers", () => {
  // 2026-11-24 23:30 UTC is already 2026-11-25 in Tokyo and still 2026-11-24 in New York.
  const instant = new Date("2026-11-24T23:30:00Z");

  it("returns today's date in the user's timezone", () => {
    expect(todayIn("Asia/Tokyo", instant)).toBe("2026-11-25");
    expect(todayIn("America/New_York", instant)).toBe("2026-11-24");
    expect(todayIn("UTC", instant)).toBe("2026-11-24");
  });

  it("returns the current time of day as HH:mm in the user's timezone", () => {
    expect(currentTimeIn("Europe/Madrid", instant)).toBe("00:30");
    expect(currentTimeIn("America/New_York", instant)).toBe("18:30");
  });
});

describe("calendar date helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("computes the first day of the next month", () => {
    expect(nextMonthStart("2026-02")).toBe("2026-03-01");
    expect(nextMonthStart("2026-12")).toBe("2027-01-01");
  });

  it("counts days in a month, including leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-11")).toBe(30);
  });

  it("returns the weekday with Sunday as 0", () => {
    expect(weekdayOf("2026-11-22")).toBe(0);
    expect(weekdayOf("2026-11-23")).toBe(1);
  });

  it("drops seconds from PostgreSQL time values", () => {
    expect(toMinutePrecision("09:05:00")).toBe("09:05");
  });
});
