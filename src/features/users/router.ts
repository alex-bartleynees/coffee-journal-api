import { HttpRouter } from "effect/http";
import { registerCurrentUserEndpoint } from "./register-current/endpoint.js";
import { signupEndpoint } from "./signup/endpoint.js";

export const usersRouter = HttpRouter.addAll([
  HttpRouter.route("POST", "/api/users", signupEndpoint),
  HttpRouter.route("POST", "/api/users/me", registerCurrentUserEndpoint),
]);
