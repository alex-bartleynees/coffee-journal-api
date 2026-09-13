import { z } from "zod";

export const ListBeansRequest = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
    status: z.enum(["active", "finished", "all"]).default("active"),
    roaster: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ListBeansRequest = z.infer<typeof ListBeansRequest>;

