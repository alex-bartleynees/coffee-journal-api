import { z } from "zod";

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
    query: z.string().trim().min(2).max(100),
    entities: z.array(Entity).min(1).max(6).optional(),
    limit: z.number().int().min(1).max(25).default(10),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const AllNoteEntities = Entity.options;
export type SearchNotesRequest = z.infer<typeof SearchNotesRequest>;

