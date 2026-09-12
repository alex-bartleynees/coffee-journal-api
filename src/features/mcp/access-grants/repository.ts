import { Context, Effect } from "effect";
import { DbError } from "../../../shared/persistence/errors.js";

export interface McpAccessGrantRepositoryService {
  readonly hasAccess: (userId: string) => Effect.Effect<boolean, DbError>;
}

export class McpAccessGrantRepository extends Context.Tag(
  "McpAccessGrantRepository",
)<McpAccessGrantRepository, McpAccessGrantRepositoryService>() {}
