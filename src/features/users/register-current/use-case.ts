import { Effect } from "effect";
import { UserRepository } from "../repository.js";
import type { RegisterCurrentUserRequest } from "./request.js";

/** Register a verified identity independently from subscription access. */
export const registerCurrentUser = (request: RegisterCurrentUserRequest) =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    yield* users.register(request.userId, request.email);
    return { registered: true } as const;
  });
