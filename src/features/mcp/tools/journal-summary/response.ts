import { z } from "zod";

export const JournalSummaryResponse = z.object({
  period: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  totalBrews: z.number().int().nonnegative(),
  ratedBrews: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
  favoriteBrews: z.number().int().nonnegative(),
  topMethods: z.array(
    z.object({
      methodId: z.string(),
      label: z.string(),
      brewCount: z.number().int().positive(),
    }),
  ),
  topBeans: z.array(
    z.object({
      beanId: z.string(),
      name: z.string(),
      roaster: z.string().nullable(),
      brewCount: z.number().int().positive(),
    }),
  ),
});

export type JournalSummaryResponse = z.infer<typeof JournalSummaryResponse>;

