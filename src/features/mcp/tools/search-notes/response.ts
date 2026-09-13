import { z } from "zod";

const Entity = z.enum([
  "brew",
  "bean",
  "recipe",
  "grinder",
  "machine",
  "method",
]);

export const SearchNotesResponse = z.object({
  results: z.array(
    z.object({
      entity: Entity,
      id: z.string(),
      title: z.string(),
      text: z.string().max(1000),
      updatedAt: z.number().int().nonnegative(),
    }),
  ),
  nextCursor: z.string().optional(),
});

export type SearchNotesResponse = z.infer<typeof SearchNotesResponse>;

