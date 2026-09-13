import { Schema } from "effect";

export const ProtectedResourceMetadataResponse = Schema.Struct({
  resource: Schema.String,
  authorization_servers: Schema.Array(Schema.String),
  scopes_supported: Schema.Array(Schema.String),
  resource_name: Schema.String,
});
export type ProtectedResourceMetadataResponse =
  typeof ProtectedResourceMetadataResponse.Type;

