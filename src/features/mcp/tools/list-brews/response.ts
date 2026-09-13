import { z } from "zod";

const BrewSummary = z
  .object({
    id: z.string(),
    beanId: z.string(),
    method: z.string(),
    date: z.string(),
    time: z.string(),
    rating: z.number().nullable(),
    recipeNotes: z.string().optional(),
    aroma: z.string().optional(),
    flavor: z.string().optional(),
    body: z.string().optional(),
    finish: z.string().optional(),
    descriptors: z.array(z.string()).optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

export const ListBrewsResponse = z.object({
  brews: z.array(BrewSummary),
  nextCursor: z.string().optional(),
});

export type ListBrewsResponse = z.infer<typeof ListBrewsResponse>;

