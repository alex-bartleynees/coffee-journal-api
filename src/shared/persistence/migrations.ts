import { Effect } from 'effect';
import type postgres from 'postgres';

/** Apply the current additive schema before any HTTP or consumer work starts. */
export const migrate = (sql: postgres.Sql) =>
	Effect.promise(async () => {
		await sql`CREATE SEQUENCE IF NOT EXISTS sync_seq`;
		await sql`
			CREATE TABLE IF NOT EXISTS sync_records (
				user_id    text   NOT NULL,
				entity     text   NOT NULL,
				id         text   NOT NULL,
				payload    jsonb,
				updated_at bigint NOT NULL,
				deleted    boolean NOT NULL DEFAULT false,
				server_seq bigint NOT NULL,
				PRIMARY KEY (user_id, entity, id)
			)`;
		await sql`CREATE INDEX IF NOT EXISTS sync_records_user_seq ON sync_records (user_id, server_seq)`;
		await sql`
			CREATE TABLE IF NOT EXISTS entitlements (
				user_id              text NOT NULL PRIMARY KEY,
				product_id           text NOT NULL,
				has_access           boolean NOT NULL,
				status               text NOT NULL,
				current_period_end   timestamptz,
				cancel_at_period_end boolean NOT NULL DEFAULT false,
				updated_at           timestamptz NOT NULL DEFAULT now()
			)`;
		await sql`
			CREATE TABLE IF NOT EXISTS processed_messages (
				message_id   text NOT NULL PRIMARY KEY,
				processed_at timestamptz NOT NULL DEFAULT now()
			)`;
		await sql`
			CREATE TABLE IF NOT EXISTS users (
				user_id      text NOT NULL PRIMARY KEY,
				email        text,
				created_at   timestamptz NOT NULL DEFAULT now(),
				last_sync_at timestamptz
			)`;
		await sql`ALTER TABLE users ALTER COLUMN last_sync_at DROP NOT NULL`;
		await sql`ALTER TABLE users ALTER COLUMN last_sync_at DROP DEFAULT`;
		await sql`
			CREATE TABLE IF NOT EXISTS bean_photos (
				user_id    text NOT NULL,
				bean_id    text NOT NULL,
				updated_at bigint NOT NULL,
				deleted    boolean NOT NULL DEFAULT false,
				mime_type  text,
				object_key text,
				PRIMARY KEY (user_id, bean_id)
			)`;
	});
