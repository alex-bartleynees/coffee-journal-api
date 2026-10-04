import { HttpRouter } from "effect/http";
import { deletePhotoEndpoint } from "./delete/endpoint.js";
import { getPhotoEndpoint } from "./get/endpoint.js";
import { photoManifestEndpoint } from "./manifest/endpoint.js";
import { putPhotoEndpoint } from "./put/endpoint.js";

export const photosRouter = HttpRouter.addAll([
  HttpRouter.route("GET", "/api/photos", photoManifestEndpoint),
  HttpRouter.route("PUT", "/api/photos/:beanId", putPhotoEndpoint),
  HttpRouter.route("GET", "/api/photos/:beanId", getPhotoEndpoint),
  HttpRouter.route("DELETE", "/api/photos/:beanId", deletePhotoEndpoint),
]);
