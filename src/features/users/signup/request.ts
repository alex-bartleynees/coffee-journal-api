import { Schema } from "effect";

const Name = Schema.transform(
  Schema.String,
  Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  {
    strict: true,
    decode: (name) => name.trim(),
    encode: (name) => name,
  },
);

const Email = Schema.transform(
  Schema.String,
  Schema.String.pipe(
    Schema.maxLength(254),
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  ),
  {
    strict: true,
    decode: (email) => email.trim().toLowerCase(),
    encode: (email) => email,
  },
);

export const CreateUserRequest = Schema.Struct({
  name: Name,
  email: Email,
  password: Schema.String.pipe(Schema.minLength(8), Schema.maxLength(128)),
});
export type CreateUserRequest = typeof CreateUserRequest.Type;
