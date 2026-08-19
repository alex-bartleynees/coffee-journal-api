import { Data } from "effect";

export class PhotoRequestError extends Data.TaggedError("PhotoRequestError")<{
  readonly status: number;
  readonly code: string;
}> {}
