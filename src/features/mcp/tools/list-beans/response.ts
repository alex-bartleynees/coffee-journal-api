import { z } from "zod";

const Bean = z.object({
  id: z.string(),
  name: z.string(),
  roaster: z.string(),
  origin: z.string(),
  process: z.string(),
  varietal: z.string(),
  roast: z.enum(["light", "medium", "dark"]),
  altitude: z.string(),
  tasting: z.array(z.string()),
  dateOpened: z.string(),
  roastDate: z.string(),
  pricePerKg: z.number(),
  bagWeight: z.number(),
  brews: z.number().int().nonnegative(),
  finished: z.boolean().optional(),
});

export const ListBeansResponse = z.object({
  beans: z.array(Bean),
  nextCursor: z.string().optional(),
});

export type ListBeansResponse = z.infer<typeof ListBeansResponse>;

