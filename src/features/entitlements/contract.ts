import { Schema } from "effect";

/** Our slug in the shared multi-tenant Payments.Gateway. */
export const PRODUCT_ID = "coffee_journal";

/** Contract published by the shared Payments.Gateway using .NET JSON casing. */
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
