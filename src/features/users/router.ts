import { HttpRouter } from "@effect/platform";
import { registerCurrentUserEndpoint } from "./register-current/endpoint.js";
import { signupEndpoint } from "./signup/endpoint.js";

export const usersRouter = HttpRouter.empty.pipe(
  HttpRouter.post("/api/users", signupEndpoint),
  HttpRouter.post("/api/users/me", registerCurrentUserEndpoint),
);
