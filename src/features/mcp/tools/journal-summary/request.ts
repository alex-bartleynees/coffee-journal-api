import { z } from "zod";
import { OptionalCalendarDate } from "../request-schema.js";

export const JournalSummaryRequest = z
  .object({
    from: OptionalCalendarDate,
    to: OptionalCalendarDate,
  })
  .strict()
  .refine(
    ({ from, to }) => from == null || to == null || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export type JournalSummaryRequest = z.infer<typeof JournalSummaryRequest>;
