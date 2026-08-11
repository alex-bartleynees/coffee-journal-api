import { Schema } from 'effect';

export const CreateUserRequest = Schema.Struct({
	name: Schema.String,
	email: Schema.String,
	password: Schema.String
});
export type CreateUserRequest = typeof CreateUserRequest.Type;

export const CreateUserResponse = Schema.Struct({
	created: Schema.Boolean,
	existing: Schema.Boolean
});
export type CreateUserResponse = typeof CreateUserResponse.Type;
