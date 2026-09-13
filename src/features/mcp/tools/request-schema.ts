import { z } from "zod";

const absentString = (value: unknown): unknown =>
  value === null || (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;

export const optionalString = (maximumLength: number) =>
  z.preprocess(
    absentString,
    z.string().trim().min(1).max(maximumLength).optional(),
  ).nullable();

export const OptionalCursor = optionalString(512);

const CalendarDate = z.string().refine(
  (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match == null) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  },
  { message: "Expected a valid YYYY-MM-DD calendar date" },
);

export const OptionalCalendarDate = z.preprocess(
  absentString,
  CalendarDate.optional(),
).nullable();

export const optionalNumber = (minimum: number, maximum: number) =>
  z.number().min(minimum).max(maximum).optional().nullable();

export const optionalArray = <T extends z.ZodType>(item: T, maximum: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value) && value.length === 0 ? undefined : value,
    z.array(item).min(1).max(maximum).optional(),
  ).nullable();
