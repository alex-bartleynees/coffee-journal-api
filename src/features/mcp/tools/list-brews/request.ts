import { z } from "zod";
import {
  OptionalCalendarDate,
  OptionalCursor,
  optionalNumber,
  optionalString,
} from "../request-schema.js";

export const ListBrewsRequest = z
  .object({
    limit: z.number().int().min(1).max(50).optional().nullable(),
    cursor: OptionalCursor,
    from: OptionalCalendarDate,
    to: OptionalCalendarDate,
    method: optionalString(100).describe(
      "Brewing method ID, such as espresso or v60; omit, null, or all for every method",
    ),
    minimumRating: optionalNumber(0, 10),
    beanId: optionalString(128).describe(
      "Exact bean ID; omit, null, or all for every bean",
    ),
  })
  .strict()
  .refine(
    ({ from, to }) => from == null || to == null || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export type ListBrewsRequest = z.infer<typeof ListBrewsRequest>;
