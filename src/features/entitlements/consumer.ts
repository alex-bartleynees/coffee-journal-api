import amqplib, {
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from "amqplib";
import {
  context,
  propagation,
  trace,
  type SpanContext,
  type TextMapGetter,
} from "@opentelemetry/api";
import * as OtelTracer from "@effect/opentelemetry/OtelTracer";
import {
  Deferred,
  Duration,
  Effect,
  FiberSet,
  Layer,
  Redacted,
  Schedule,
  Schema,
} from "effect";
import { EntitlementConsumerConfig } from "./config.js";
import { EntitlementEvent, PRODUCT_ID } from "./event.js";
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
const REQUEUE_DELAY = Duration.seconds(5);
const HEALTHY_SESSION = Duration.minutes(1);

const decodeEvent = Schema.decodeUnknownEffect(
  Schema.fromJsonString(EntitlementEvent),
);

type RabbitHeaders = NonNullable<ConsumeMessage["properties"]["headers"]>;

const rabbitHeaderGetter: TextMapGetter<RabbitHeaders> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => {
    const headerKey = Object.keys(carrier).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    const value = headerKey === undefined ? undefined : carrier[headerKey];
    if (typeof value === "string") return value;
    if (Buffer.isBuffer(value)) return value.toString("utf8");
    return undefined;
  },
};

export const extractParentSpanContext = (
  headers: ConsumeMessage["properties"]["headers"],
): SpanContext | undefined => {
  if (headers === undefined) return undefined;

  const extracted = propagation.extract(
    context.active(),
    headers,
    rabbitHeaderGetter,
  );
  const parent = trace.getSpanContext(extracted);
  return parent !== undefined && trace.isSpanContextValid(parent)
    ? parent
    : undefined;
};

const handleMessage = (channel: Channel, msg: ConsumeMessage) => {
  let processing = Effect.gen(function* () {
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
    Effect.withSpan("coffee.entitlement.process", {
      kind: "consumer",
      attributes: {
        "messaging.system": "rabbitmq",
        "messaging.destination.name": QUEUE,
      },
    }),
    Effect.catchTags({
      SchemaError: (error) =>
        Effect.logWarning("[entitlements] dead-lettering", error).pipe(
          Effect.andThen(Effect.sync(() => channel.nack(msg, false, false))),
        ),
      DbError: (error) =>
        Effect.logWarning("[entitlements] requeueing", error).pipe(
          Effect.andThen(Effect.sleep(REQUEUE_DELAY)),
          Effect.andThen(Effect.sync(() => channel.nack(msg, false, true))),
        ),
    }),
  );

  const parent = extractParentSpanContext(msg.properties.headers);
  if (parent !== undefined) {
    processing = OtelTracer.withSpanContext(processing, parent);
  }

  return processing;
};

/** One connect-and-consume session; fails once it can no longer consume. */
const consumeSession = (url: string) =>
  Effect.gen(function* () {
    const ended = yield* Deferred.make<never, Error>();
    const end = (reason: string) =>
      Deferred.doneUnsafe(ended, Effect.fail(new Error(reason)));

    const connection: ChannelModel = yield* Effect.tryPromise({
      try: () => amqplib.connect(url),
      catch: (e) => new Error(`amqp connect failed: ${String(e)}`),
    });
    connection.on("error", (e) => end(`amqp connection error: ${e.message}`));
    connection.on("close", () => end("amqp connection closed"));

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => connection.close().catch(() => undefined)),
    );

    const channel = yield* Effect.tryPromise({
      try: () => connection.createChannel(),
      catch: (e) => new Error(`amqp channel failed: ${String(e)}`),
    });
    channel.on("error", (e) => end(`amqp channel error: ${e.message}`));
    channel.on("close", () => end("amqp channel closed"));

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

    const run = yield* FiberSet.makeRuntime<EntitlementRepository>();

    yield* Effect.tryPromise({
      try: () =>
        channel.consume(QUEUE, (msg) => {
          if (msg === null) {
            end("amqp consumer cancelled by broker");
          } else {
            run(handleMessage(channel, msg));
          }
        }),
      catch: (e) => new Error(`amqp consume failed: ${String(e)}`),
    });

    yield* Effect.logInfo(`[entitlements] consuming ${QUEUE} on ${EXCHANGE}`);

    return yield* Deferred.await(ended);
  }).pipe(Effect.scoped);

const reconnectBackoff = Schedule.min([
  Schedule.exponential(Duration.seconds(1)),
  Schedule.spaced(Duration.seconds(30)),
]);

/** Drops after HEALTHY_SESSION count as success, resetting the backoff. */
const supervisedSession = (url: string) =>
  Effect.gen(function* () {
    const [uptime, error] = yield* Effect.timed(
      Effect.flip(consumeSession(url)),
    );
    yield* Effect.logWarning(`[entitlements] session failed: ${error.message}`);
    if (Duration.isLessThan(uptime, HEALTHY_SESSION)) {
      return yield* Effect.fail(error);
    }
  });

export const EntitlementConsumerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const url = Redacted.value(yield* EntitlementConsumerConfig);
    yield* Effect.forkScoped(
      supervisedSession(url).pipe(
        Effect.retry(reconnectBackoff),
        Effect.forever,
      ),
    );
  }),
);
