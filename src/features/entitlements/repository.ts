import { Context, Effect } from 'effect';
import type { DbError } from '../../shared/persistence/errors.js';
import type { EntitlementEvent } from './contract.js';

export interface EntitlementRepositoryService {
	readonly hasAccess: (userId: string) => Effect.Effect<boolean, DbError>;
	readonly apply: (event: EntitlementEvent) => Effect.Effect<boolean, DbError>;
}

export class EntitlementRepository extends Context.Tag('EntitlementRepository')<
	EntitlementRepository,
	EntitlementRepositoryService
>() {}
