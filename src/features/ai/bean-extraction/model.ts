import { z } from "zod";

const optionalText = z.string().trim().max(160).nullable();

export const beanExtractionSchema = z.object({
  name: optionalText,
  roaster: optionalText,
  origin: optionalText,
  process: optionalText,
  varietal: optionalText,
  roast: z.enum(["light", "medium", "dark"]).nullable(),
  altitude: optionalText,
  tasting: z.array(z.string().trim().min(1).max(80)).max(12),
}).strict();

export type BeanExtraction = z.infer<typeof beanExtractionSchema>;
