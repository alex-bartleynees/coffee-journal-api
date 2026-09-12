import type { Headers } from "@effect/platform";
import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";
import { Auth } from "../../shared/auth.js";
import { EntitlementRepository } from "../entitlements/repository.js";
import { PhotoRequestError } from "./errors.js";
import { parseBeanId } from "./validation.js";

export const authorizePhotoRequest = (headers: Headers.Headers) =>
  Effect.gen(function* () {
    const auth = yield* Auth;
    const entitlements = yield* EntitlementRepository;
    const user = yield* auth.user(headers);
    if (!(yield* entitlements.hasAccess(user.userId))) {
      return yield* new PhotoRequestError({
        status: 403,
        code: "subscription_required",
      });
    }
    return user;
  });

export const parsePhotoBeanId = Effect.gen(function* () {
  const beanId = (yield* HttpRouter.params).beanId;
  return yield* parseBeanId(beanId);
});
