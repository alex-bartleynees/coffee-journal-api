import { z } from "zod";
import {
  OptionalCalendarDate,
  OptionalCursor,
  optionalNumber,
  optionalString,
} from "../request-schema.js";

export const ListBrewsRequest = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: OptionalCursor,
    from: OptionalCalendarDate,
    to: OptionalCalendarDate,
    method: optionalString(100),
    minimumRating: optionalNumber(0, 10),
    beanId: optionalString(128),
  })
  .strict()
  .refine(
    ({ from, to }) => from == null || to == null || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export type ListBrewsRequest = z.infer<typeof ListBrewsRequest>;
