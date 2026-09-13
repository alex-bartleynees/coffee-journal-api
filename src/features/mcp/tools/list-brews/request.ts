import { z } from "zod";

const CalendarDate = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  },
  { message: "Expected a valid YYYY-MM-DD calendar date" },
);

export const ListBrewsRequest = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
    method: z.string().trim().min(1).max(100).optional(),
    minimumRating: z.number().min(0).max(10).optional(),
    beanId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    ({ from, to }) => from === undefined || to === undefined || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export type ListBrewsRequest = z.infer<typeof ListBrewsRequest>;
