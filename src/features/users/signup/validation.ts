import { Effect, Schema } from "effect";
import type { CreateUserRequest } from "./contract.js";
import { InvalidSignup } from "./errors.js";

const NormalizedName = Schema.transform(
  Schema.String,
  Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  {
    strict: true,
    decode: (name) => name.trim(),
    encode: (name) => name,
  },
);

const NormalizedEmail = Schema.transform(
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

const NormalizedCreateUserRequest = Schema.Struct({
  name: NormalizedName,
  email: NormalizedEmail,
  password: Schema.String.pipe(Schema.minLength(8), Schema.maxLength(128)),
});

const decodeSignupRequest = Schema.decodeUnknown(NormalizedCreateUserRequest);

export const parseSignupRequest = (input: CreateUserRequest) =>
  decodeSignupRequest(input).pipe(
    Effect.mapError(() => new InvalidSignup()),
  );
