import { Schema, SchemaTransformation } from "effect";

const Name = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    SchemaTransformation.trim(),
  ),
);

const Email = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isMaxLength(254),
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    ),
    SchemaTransformation.transform({
      decode: (email) => email.trim().toLowerCase(),
      encode: (email) => email,
    }),
  ),
);

export const CreateUserRequest = Schema.Struct({
  name: Name,
  email: Email,
  password: Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
});
export type CreateUserRequest = typeof CreateUserRequest.Type;
