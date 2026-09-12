import { Data } from "effect";

export class SignupRateLimited extends Data.TaggedError("SignupRateLimited") {}
