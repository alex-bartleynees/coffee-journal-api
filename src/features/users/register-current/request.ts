import { Schema } from "effect";

export const RegisterCurrentUserRequest = Schema.Struct({
  userId: Schema.String,
  email: Schema.NullOr(Schema.String),
});
export type RegisterCurrentUserRequest =
  typeof RegisterCurrentUserRequest.Type;
