import amqplib from "amqplib";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { apiUrl, authenticatedHeaders } from "./infrastructure/api.js";
import { integrationContext } from "./infrastructure/global-setup.js";

const EXCHANGE = "payments-direct";
const ROUTING_KEY = "subscription.entitlement.changed";

type EntitlementEvent = {
  readonly MessageId: string;
  readonly ProductId: string;
  readonly UserId: string;
  readonly Status: string;
  readonly HasAccess: boolean;
  readonly CurrentPeriodEnd: string | null;
  readonly CancelAtPeriodEnd: boolean;
};

const publish = async (event: EntitlementEvent) => {
  const connection = await amqplib.connect(integrationContext().rabbitMqUrl);
  const channel = await connection.createConfirmChannel();
  try {
    await channel.assertExchange(EXCHANGE, "direct", {
      durable: true,
      autoDelete: false,
    });
    channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(event)), {
      contentType: "application/json",
      persistent: true,
    });
    await channel.waitForConfirms();
  } finally {
    await channel.close();
    await connection.close();
  }
};

const syncStatus = (userId: string) =>
  fetch(apiUrl("/api/sync"), {
    method: "POST",
    headers: authenticatedHeaders(userId, {
      "content-type": "application/json",
    }),
    body: JSON.stringify({ since: 0, changes: [] }),
  });

const waitForStatus = async (userId: string, expectedStatus: number) => {
  const deadline = Date.now() + 10_000;
  let actual = 0;
  while (Date.now() < deadline) {
    const response = await syncStatus(userId);
    actual = response.status;
    if (actual === expectedStatus) return response;
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for sync status ${expectedStatus}; last status was ${actual}`,
  );
};

const entitlement = (
  userId: string,
  overrides: Partial<EntitlementEvent> = {},
): EntitlementEvent => ({
  MessageId: crypto.randomUUID(),
  ProductId: "coffee_journal",
  UserId: userId,
  Status: "active",
  HasAccess: true,
  CurrentPeriodEnd: new Date("2030-01-01T00:00:00Z").toISOString(),
  CancelAtPeriodEnd: false,
  ...overrides,
});

describe("entitlements", () => {
  it("projects RabbitMQ events into fail-closed sync access and deduplicates message IDs", async () => {
    const userId = crypto.randomUUID();
    const granted = entitlement(userId);

    expect((await syncStatus(userId)).status).toBe(403);
    await publish(granted);
    expect((await waitForStatus(userId, 200)).status).toBe(200);

    await publish(
      entitlement(userId, {
        MessageId: granted.MessageId,
        Status: "canceled",
        HasAccess: false,
      }),
    );
    await delay(300);
    expect((await syncStatus(userId)).status).toBe(200);
  });

  it("ignores entitlement events for other products", async () => {
    const userId = crypto.randomUUID();
    await publish(entitlement(userId, { ProductId: "another_product" }));
    await delay(300);

    expect((await syncStatus(userId)).status).toBe(403);
  });
});
