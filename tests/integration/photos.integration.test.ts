import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { apiUrl, authenticatedHeaders } from "./infrastructure/api.js";
import { integrationContext } from "./infrastructure/global-setup.js";

const grantPhotoAccess = async (userId: string) => {
  const sql = postgres(integrationContext().databaseUrl);
  try {
    await sql`INSERT INTO entitlements (user_id, product_id, has_access, status)
			VALUES (${userId}, 'coffee_journal', true, 'active')`;
  } finally {
    await sql.end();
  }
};

const uploadPhoto = (
  userId: string,
  beanId: string,
  updatedAt: number,
  photo: Uint8Array,
) =>
  fetch(apiUrl(`/api/photos/${beanId}`), {
    method: "PUT",
    headers: authenticatedHeaders(userId, {
      "content-type": "image/jpeg",
      "x-photo-updated-at": String(updatedAt),
    }),
    body: photo,
  });

describe("photos", () => {
  it("uploads, lists, downloads, and deletes an entitled bean photo", async () => {
    const userId = crypto.randomUUID();
    const beanId = crypto.randomUUID();
    const updatedAt = 4_000;
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02, 0x03]);
    await grantPhotoAccess(userId);

    const upload = await uploadPhoto(userId, beanId, updatedAt, photo);
    expect(upload.status).toBe(200);
    expect(await upload.json()).toEqual({
      applied: true,
      photo: { beanId, updatedAt, deleted: false, mimeType: "image/jpeg" },
    });

    const manifest = await fetch(apiUrl("/api/photos"), {
      headers: authenticatedHeaders(userId),
    });
    expect(await manifest.json()).toEqual({
      photos: [{ beanId, updatedAt, deleted: false, mimeType: "image/jpeg" }],
    });

    const download = await fetch(apiUrl(`/api/photos/${beanId}`), {
      headers: authenticatedHeaders(userId),
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(photo);

    const remove = await fetch(apiUrl(`/api/photos/${beanId}`), {
      method: "DELETE",
      headers: authenticatedHeaders(userId, {
        "x-photo-updated-at": String(updatedAt + 1),
      }),
    });
    expect(remove.status).toBe(200);
    expect(await remove.json()).toEqual({
      applied: true,
      photo: {
        beanId,
        updatedAt: updatedAt + 1,
        deleted: true,
        mimeType: null,
      },
    });

    const afterDelete = await fetch(apiUrl(`/api/photos/${beanId}`), {
      headers: authenticatedHeaders(userId),
    });
    expect(afterDelete.status).toBe(404);
    expect(await afterDelete.json()).toEqual({ error: "photo_not_found" });
  });

  it("requires authentication and entitlement and validates bean identifiers", async () => {
    const anonymous = await fetch(apiUrl("/api/photos"));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toBe("Unauthorized");

    const userId = crypto.randomUUID();
    const unentitled = await fetch(apiUrl("/api/photos"), {
      headers: authenticatedHeaders(userId),
    });
    expect(unentitled.status).toBe(403);
    expect(await unentitled.json()).toEqual({ error: "subscription_required" });

    await grantPhotoAccess(userId);
    const invalidBean = await fetch(apiUrl("/api/photos/invalid!"), {
      headers: authenticatedHeaders(userId),
    });
    expect(invalidBean.status).toBe(400);
    expect(await invalidBean.json()).toEqual({ error: "invalid_bean_id" });
  });

  it("keeps the newer server photo when an older upload arrives", async () => {
    const userId = crypto.randomUUID();
    const beanId = crypto.randomUUID();
    const newer = new Uint8Array([0xff, 0xd8, 0xff, 0x10]);
    const older = new Uint8Array([0xff, 0xd8, 0xff, 0x09]);
    await grantPhotoAccess(userId);
    expect((await uploadPhoto(userId, beanId, 10_000, newer)).status).toBe(200);

    const staleUpload = await uploadPhoto(userId, beanId, 9_000, older);
    expect(staleUpload.status).toBe(200);
    expect(await staleUpload.json()).toEqual({
      applied: false,
      photo: {
        beanId,
        updatedAt: 10_000,
        deleted: false,
        mimeType: "image/jpeg",
      },
    });

    const download = await fetch(apiUrl(`/api/photos/${beanId}`), {
      headers: authenticatedHeaders(userId),
    });
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(newer);
  });
});
