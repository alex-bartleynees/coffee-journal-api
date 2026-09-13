import { z } from "zod";

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

export const JournalSummaryRequest = z
  .object({
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
  })
  .strict()
  .refine(
    ({ from, to }) => from === undefined || to === undefined || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export type JournalSummaryRequest = z.infer<typeof JournalSummaryRequest>;

