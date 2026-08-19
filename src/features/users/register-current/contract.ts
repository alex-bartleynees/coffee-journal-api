import { Schema } from "effect";

export const RegisterCurrentUserResponse = Schema.Struct({
  registered: Schema.Literal(true),
});

export type RegisterCurrentUserResponse =
  typeof RegisterCurrentUserResponse.Type;
