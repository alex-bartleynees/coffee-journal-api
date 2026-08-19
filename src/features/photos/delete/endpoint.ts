import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { PhotoMutationResponse } from "../contract.js";
import { handlePhotoFailures } from "../endpoint-support.js";
import { PhotoRequestError } from "../errors.js";
import { photoRequestContext } from "../request-context.js";
import { deletePhoto } from "../use-cases.js";

export const deletePhotoEndpoint = handlePhotoFailures(
  Effect.gen(function* () {
    const { request, user, beanId } = yield* photoRequestContext;
    const updatedAt = Number(request.headers["x-photo-updated-at"]);
    if (!beanId || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
      return yield* new PhotoRequestError({
        status: 400,
        code: "invalid_photo",
      });
    }
    const response = yield* deletePhoto(user.userId, {
      beanId,
      updatedAt,
      deleted: true,
      mimeType: null,
    });
    return yield* HttpServerResponse.schemaJson(PhotoMutationResponse)(
      response,
    );
  }),
);
