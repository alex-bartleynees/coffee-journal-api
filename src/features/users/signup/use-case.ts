import { Effect } from "effect";
import { Keycloak } from "../keycloak.js";
import { SignupRateLimited } from "./errors.js";
import type { CreateUserRequest } from "./request.js";
import type { CreateUserResponse } from "./response.js";

const attempts = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 5;

/** Claim an attempt before body decoding, preserving abuse protection for malformed requests. */
export const claimSignupAttempt = (clientIp: string) =>
  Effect.gen(function* () {
    const allowed = yield* Effect.sync(() => {
      const now = Date.now();
      if (attempts.size > 10_000) {
        for (const [key, value] of attempts) {
          if (value.resetsAt <= now) {
            attempts.delete(key);
          }
        }
      }
      const current = attempts.get(clientIp);
      if (!current || current.resetsAt <= now) {
        attempts.set(clientIp, { count: 1, resetsAt: now + WINDOW_MS });
        return true;
      }
      current.count += 1;
      return current.count <= ATTEMPT_LIMIT;
    });
    if (!allowed) {
      return yield* new SignupRateLimited();
    }
  });

export const createUser = (request: CreateUserRequest) =>
  Effect.gen(function* () {
    const keycloak = yield* Keycloak;
    const outcome = yield* keycloak.createUser(request);
    return {
      created: outcome === "created",
      existing: outcome === "existing",
    } satisfies CreateUserResponse;
  });
