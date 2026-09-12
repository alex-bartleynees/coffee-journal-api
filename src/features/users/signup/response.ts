import { Schema } from "effect";

export const CreateUserResponse = Schema.Struct({
  created: Schema.Boolean,
  existing: Schema.Boolean,
});
export type CreateUserResponse = typeof CreateUserResponse.Type;
