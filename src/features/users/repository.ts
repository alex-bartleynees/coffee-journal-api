import { Context, type Effect } from 'effect';
import type { DbError } from '../../shared/persistence/errors.js';

export interface UserRepositoryService {
	readonly register: (userId: string, email: string | null) => Effect.Effect<void, DbError>;
	readonly touchAfterSync: (userId: string, email: string | null) => Effect.Effect<void, DbError>;
}

export class UserRepository extends Context.Tag('UserRepository')<
	UserRepository,
	UserRepositoryService
>() {}
