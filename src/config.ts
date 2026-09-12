import { Config } from "effect";

export const AppConfig = {
  port: Config.port("PORT").pipe(Config.withDefault(3001)),
};

/** Our slug in the shared multi-tenant Payments.Gateway. */
export const PRODUCT_ID = "coffee_journal";
