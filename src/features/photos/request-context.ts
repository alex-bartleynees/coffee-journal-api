import { HttpRouter, HttpServerRequest } from '@effect/platform';
import { Effect } from 'effect';
import { Auth } from '../../shared/auth.js';
import { EntitlementRepository } from '../entitlements/repository.js';
import { PhotoRequestError } from './errors.js';

const validBeanId = (beanId: string) => /^[A-Za-z0-9_-]{1,128}$/.test(beanId);

/** Authenticate, fail closed on access, and validate the optional route bean id. */
export const photoRequestContext = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const auth = yield* Auth;
	const entitlements = yield* EntitlementRepository;
	const user = yield* auth.user(request.headers);
	if (!(yield* entitlements.hasAccess(user.userId))) {
		return yield* new PhotoRequestError({ status: 403, code: 'subscription_required' });
	}
	const beanId = (yield* HttpRouter.params).beanId;
	if (beanId != null && !validBeanId(beanId)) {
		return yield* new PhotoRequestError({ status: 400, code: 'invalid_bean_id' });
	}
	return { request, user, beanId };
});
