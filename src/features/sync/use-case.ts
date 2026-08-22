import { Data, Effect } from "effect";
import type { AuthUser } from "../../shared/auth.js";
import { EntitlementRepository } from "../entitlements/repository.js";
import { UserRepository } from "../users/repository.js";
import type { SyncRequest } from "./contract.js";
import { SyncRepository } from "./repository.js";

export class SubscriptionRequired extends Data.TaggedError(
  "SubscriptionRequired",
) {}

/** Preserve the fail-closed access decision before transport body decoding. */
export const authorizeSync = (userId: string) =>
  Effect.gen(function* () {
    const entitlements = yield* EntitlementRepository;
    if (!(yield* entitlements.hasAccess(userId)))
      return yield* new SubscriptionRequired();
  });

/** Run the transactional LWW cycle and record the successful user sync. */
export const synchronize = (user: AuthUser, request: SyncRequest) =>
  Effect.gen(function* () {
    const sync = yield* SyncRepository;
    const users = yield* UserRepository;
    const response = yield* sync.run(user.userId, request);
    yield* users.touchAfterSync(user.userId, user.email);
    return response;
  }).pipe(
    Effect.withSpan("coffee.sync", {
      kind: "internal",
      attributes: { "coffee.sync.change_count": request.changes.length },
    }),
  );
