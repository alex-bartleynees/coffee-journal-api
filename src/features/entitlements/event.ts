import { Schema } from "effect";

export const PRODUCT_ID = "coffee_journal";

export const EntitlementEvent = Schema.Struct({
  MessageId: Schema.String,
  ProductId: Schema.String,
  UserId: Schema.String,
  Status: Schema.String,
  HasAccess: Schema.Boolean,
  CurrentPeriodEnd: Schema.NullishOr(Schema.String),
  CancelAtPeriodEnd: Schema.Boolean,
});

export type EntitlementEvent = typeof EntitlementEvent.Type;
