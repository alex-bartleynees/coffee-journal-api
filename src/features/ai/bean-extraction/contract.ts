import { Schema } from "effect";
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

export const BeanExtractionResponse = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  roaster: Schema.NullOr(Schema.String),
  origin: Schema.NullOr(Schema.String),
  process: Schema.NullOr(Schema.String),
  varietal: Schema.NullOr(Schema.String),
  roast: Schema.NullOr(Schema.Literal("light", "medium", "dark")),
  altitude: Schema.NullOr(Schema.String),
  tasting: Schema.Array(Schema.String),
});
