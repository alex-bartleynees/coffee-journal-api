import type { Headers } from "@effect/platform";
import { Effect } from "effect";
import { Auth } from "../../../shared/auth.js";
import { UserRepository } from "../repository.js";

/** Register a verified identity independently from subscription access. */
export const registerCurrentUser = (headers: Headers.Headers) =>
  Effect.gen(function* () {
    const auth = yield* Auth;
    const users = yield* UserRepository;
    const user = yield* auth.user(headers);
    yield* users.register(user.userId, user.email);
    return { registered: true } as const;
  });
