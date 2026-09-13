import { z } from "zod";
import {
  OptionalCursor,
  optionalArray,
  optionalString,
} from "../request-schema.js";

const Entity = z.enum([
  "brew",
  "bean",
  "recipe",
  "grinder",
  "machine",
  "method",
]);

export const SearchNotesRequest = z
  .object({
    query: optionalString(100),
    entities: optionalArray(Entity, 6),
    limit: z.number().int().min(1).max(25).optional().nullable(),
    cursor: OptionalCursor,
  })
  .strict();

export const AllNoteEntities = Entity.options;
export type SearchNotesRequest = z.infer<typeof SearchNotesRequest>;
