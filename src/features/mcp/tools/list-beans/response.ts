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
  consumedWeight: z.number().nonnegative().describe("Recorded coffee consumed in grams"),
  remainingWeight: z
    .number()
    .nonnegative()
    .nullable()
    .describe(
      "Estimated grams remaining, or null when a linked brew has no recorded dose",
    ),
  finished: z.boolean().optional(),
});

export const ListBeansResponse = z.object({
  beans: z.array(Bean),
  nextCursor: z.string().optional(),
});

export type ListBeansResponse = z.infer<typeof ListBeansResponse>;
