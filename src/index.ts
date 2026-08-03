import { createServer } from 'node:http';
import { HttpMiddleware, HttpServer } from '@effect/platform';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { AppConfig } from './config.js';
import { AuthLive } from './Auth.js';
import { DatabaseLive } from './Database.js';
import { router } from './http.js';

const ServerLive = NodeHttpServer.layerConfig(() => createServer(), { port: AppConfig.port });

// The app is served from a different origin (Vite :5173 in dev, its own host
// in prod), so the browser needs CORS on every /sync call.
const AppLive = router.pipe(
	HttpServer.serve(
		HttpMiddleware.cors({
			allowedOrigins: ['*'],
			allowedMethods: ['GET', 'POST', 'OPTIONS'],
			allowedHeaders: ['content-type', 'authorization', 'x-dev-user']
		})
	),
	HttpServer.withLogAddress,
	Layer.provide(DatabaseLive),
	Layer.provide(AuthLive),
	Layer.provide(ServerLive)
);

NodeRuntime.runMain(Layer.launch(AppLive));
