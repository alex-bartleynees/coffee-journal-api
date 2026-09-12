import { Schema } from "effect";

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
export type BeanExtractionResponse = typeof BeanExtractionResponse.Type;
