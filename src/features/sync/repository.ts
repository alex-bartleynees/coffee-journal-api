import { Context, Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import type { SyncRequest, SyncResponse } from "./contract.js";

export interface SyncRepositoryService {
  readonly run: (
    userId: string,
    request: SyncRequest,
  ) => Effect.Effect<SyncResponse, DbError>;
}

export class SyncRepository extends Context.Tag("SyncRepository")<
  SyncRepository,
  SyncRepositoryService
>() {}
