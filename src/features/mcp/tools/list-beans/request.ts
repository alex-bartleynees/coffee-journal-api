import { z } from "zod";
import { OptionalCursor, optionalString } from "../request-schema.js";

export const ListBeansRequest = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: OptionalCursor,
    status: z.enum(["active", "finished", "all"]).default("active"),
    roaster: optionalString(100),
  })
  .strict();

export type ListBeansRequest = z.infer<typeof ListBeansRequest>;
