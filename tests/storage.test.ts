import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { storedObjects } from "@/server/db/schema";
import { resetEnvCache, setEnvForTests } from "@/server/env";
import { getObject, putObject } from "@/server/storage";

afterEach(() => resetEnvCache());

describe("database storage driver", () => {
  it("stores, replaces and returns file contents byte for byte", async () => {
    setEnvForTests({ STORAGE_DRIVER: "database" });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x10]);
    await putObject("org/1/creative.png", png, "image/png");
    expect(Buffer.compare(await getObject("org/1/creative.png"), png)).toBe(0);
    await putObject("org/1/creative.png", Buffer.from("replaced"), "image/png");
    expect((await getObject("org/1/creative.png")).toString()).toBe("replaced");
    expect(await getDb().select().from(storedObjects)).toHaveLength(1);
    await expect(getObject("missing")).rejects.toThrow(/not found/);
  });
});
