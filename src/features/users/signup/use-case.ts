import { Effect } from "effect";
import { Keycloak } from "../keycloak.js";
import type { CreateUserRequest, CreateUserResponse } from "./contract.js";
import { InvalidSignup, SignupRateLimited } from "./errors.js";

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
          if (value.resetsAt <= now) attempts.delete(key);
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
    if (!allowed) return yield* new SignupRateLimited();
  });

const normalize = (input: CreateUserRequest) => {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 1 || name.length > 100) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return null;
  if (input.password.length < 8 || input.password.length > 128) return null;
  return { name, email, password: input.password };
};

export const createUser = (input: CreateUserRequest) =>
  Effect.gen(function* () {
    const user = normalize(input);
    if (!user) return yield* new InvalidSignup();
    const keycloak = yield* Keycloak;
    const outcome = yield* keycloak.createUser(user);
    return {
      created: outcome === "created",
      existing: outcome === "existing",
    } satisfies CreateUserResponse;
  });
