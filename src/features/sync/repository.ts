import { Context, Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import type { SyncRequest } from "./request.js";
import type { SyncResponse } from "./response.js";

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
