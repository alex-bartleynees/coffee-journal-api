import { Config, Schema } from "effect";

export const EntitlementConsumerConfig = Config.schema(
  Schema.Redacted(
    Schema.Trim.check(
      Schema.isNonEmpty({ message: "RABBITMQ_URL must not be empty" }),
    ),
  ),
  "RABBITMQ_URL",
);
