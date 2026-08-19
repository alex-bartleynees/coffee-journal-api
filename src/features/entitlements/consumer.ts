import amqplib, {
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from "amqplib";
import { Duration, Effect, Layer, Runtime, Schedule, Schema } from "effect";
import { AppConfig, PRODUCT_ID } from "../../config.js";
import { EntitlementEvent } from "./contract.js";
import { EntitlementRepository } from "./repository.js";

/**
 * RabbitMQ consumer for the shared Payments.Gateway's
 * `SubscriptionEntitlementChanged` events — keeps the local `entitlements`
 * read-model current so the `/sync` gate never has to call the gateway.
 *
 * Topology mirrors the .NET SharedKernel consumer (verified against
 * `SharedKernel.Messaging.RabbitMq`): durable direct exchange `payments-direct`
 * (declared identically on both sides — declaration args must match or RabbitMQ
 * rejects it), our own durable queue bound on the routing key, and a DLX/DLQ
 * pair for messages that fail processing. Events for other products are simply
 * acked and skipped. Duplicate deliveries dedupe on `MessageId` in the DB.
 *
 * The consumer is a background fiber: RabbitMQ being down never blocks the
 * HTTP server (sync stays up, gate stays fail-closed on the existing
 * read-model). Connection losses retry with capped exponential backoff.
 */

const EXCHANGE = "payments-direct";
const ROUTING_KEY = "subscription.entitlement.changed";
const QUEUE = "coffee-journal.entitlements";
const DLX = "coffee-journal-dlx";
const DLQ = `${QUEUE}.dlq`;

const decodeEvent = Schema.decodeUnknown(Schema.parseJson(EntitlementEvent));

const handleMessage = (channel: Channel, msg: ConsumeMessage) =>
  Effect.gen(function* () {
    const event = yield* decodeEvent(msg.content.toString("utf8"));

    if (event.ProductId !== PRODUCT_ID) {
      channel.ack(msg);
      return;
    }

    const entitlements = yield* EntitlementRepository;
    const applied = yield* entitlements.apply(event);
    channel.ack(msg);
    yield* Effect.logInfo(
      applied
        ? `[entitlements] upserted user=${event.UserId} hasAccess=${event.HasAccess} status=${event.Status}`
        : `[entitlements] duplicate message ${event.MessageId} skipped`,
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        // Undecodable or unprocessable → DLQ (nack, no requeue), so one bad
        // message can't wedge the queue.
        console.warn("[entitlements] message failed, dead-lettering:", error);
        channel.nack(msg, false, false);
      }),
    ),
  );

/** One connect-and-consume session; the returned effect fails when the connection dies. */
const consumeSession = (url: string) =>
  Effect.gen(function* () {
    const entitlements = yield* EntitlementRepository;

    const connection: ChannelModel = yield* Effect.tryPromise({
      try: () => amqplib.connect(url),
      catch: (e) => new Error(`amqp connect failed: ${String(e)}`),
    });

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => connection.close().catch(() => undefined)),
    );

    const channel = yield* Effect.tryPromise({
      try: () => connection.createChannel(),
      catch: (e) => new Error(`amqp channel failed: ${String(e)}`),
    });

    yield* Effect.tryPromise({
      try: async () => {
        await channel.assertExchange(EXCHANGE, "direct", {
          durable: true,
          autoDelete: false,
        });
        await channel.assertExchange(DLX, "direct", {
          durable: true,
          autoDelete: false,
        });
        await channel.assertQueue(DLQ, { durable: true });
        await channel.bindQueue(DLQ, DLX, ROUTING_KEY);
        await channel.assertQueue(QUEUE, {
          durable: true,
          arguments: {
            "x-dead-letter-exchange": DLX,
            "x-dead-letter-routing-key": ROUTING_KEY,
          },
        });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(10);
      },
      catch: (e) => new Error(`amqp topology failed: ${String(e)}`),
    });

    const runtime = yield* Effect.runtime<EntitlementRepository>();

    yield* Effect.tryPromise({
      try: () =>
        channel.consume(QUEUE, (msg) => {
          if (msg) {
            Runtime.runFork(runtime)(
              handleMessage(channel, msg).pipe(
                Effect.provideService(EntitlementRepository, entitlements),
              ),
            );
          }
        }),
      catch: (e) => new Error(`amqp consume failed: ${String(e)}`),
    });

    yield* Effect.logInfo(`[entitlements] consuming ${QUEUE} on ${EXCHANGE}`);

    // Hold the session open until the connection drops, then fail so the
    // outer retry loop reconnects.
    yield* Effect.async<never, Error>((resume) => {
      connection.on("close", () =>
        resume(Effect.fail(new Error("amqp connection closed"))),
      );
      connection.on("error", () => {
        /* close always follows error; handled there */
      });
    });
  }).pipe(Effect.scoped);

export const EntitlementConsumerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const url = yield* AppConfig.rabbitMqUrl;
    if (url === "") {
      yield* Effect.logWarning(
        "[entitlements] RABBITMQ_URL unset — consumer disabled; entitlement read-model will not update",
      );
      return;
    }
    yield* Effect.forkDaemon(
      consumeSession(url).pipe(
        Effect.tapError((e) =>
          Effect.logWarning(`[entitlements] session failed: ${e.message}`),
        ),
        Effect.retry(
          Schedule.exponential(Duration.seconds(1)).pipe(
            Schedule.union(Schedule.spaced(Duration.seconds(30))),
          ),
        ),
      ),
    );
  }),
);
