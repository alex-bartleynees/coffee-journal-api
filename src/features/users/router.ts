import { HttpRouter } from '@effect/platform';
import { registerCurrentUserEndpoint } from './register-current/endpoint.js';

export const usersRouter = HttpRouter.empty.pipe(
	HttpRouter.post('/api/users/me', registerCurrentUserEndpoint)
);
