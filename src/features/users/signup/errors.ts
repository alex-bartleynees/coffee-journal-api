import { Data } from "effect";

export class InvalidSignup extends Data.TaggedError("InvalidSignup") {}
export class SignupRateLimited extends Data.TaggedError("SignupRateLimited") {}
