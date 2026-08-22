import { Data } from "effect";

export class BeanExtractionRequestError extends Data.TaggedError(
  "BeanExtractionRequestError",
)<{
  readonly status: number;
  readonly code: string;
}> {}

export class BeanExtractionError extends Data.TaggedError(
  "BeanExtractionError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
