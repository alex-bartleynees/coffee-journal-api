import { z } from "zod";

export const GetBrewRequest = z
  .object({
    brewId: z.string().min(1).max(128),
  })
  .strict();

export type GetBrewRequest = z.infer<typeof GetBrewRequest>;

