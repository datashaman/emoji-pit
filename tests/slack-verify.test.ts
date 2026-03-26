import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySlackSignature } from "../server/utils/slack-verify";

function makeSignature(secret: string, timestamp: string, body: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  return "v0=" + createHmac("sha256", secret).update(baseString).digest("hex");
}

describe("verifySlackSignature", () => {
  const secret = "test-signing-secret";
  const body = '{"type":"event_callback"}';

  it("accepts a valid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = makeSignature(secret, ts, body);
    expect(verifySlackSignature(secret, sig, ts, body)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = makeSignature(secret, ts, body);
    const tampered = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
    expect(verifySlackSignature(secret, tampered, ts, body)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = makeSignature("wrong-secret", ts, body);
    expect(verifySlackSignature(secret, sig, ts, body)).toBe(false);
  });

  it("rejects a timestamp older than 5 minutes", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 400);
    const sig = makeSignature(secret, ts, body);
    expect(verifySlackSignature(secret, sig, ts, body)).toBe(false);
  });

  it("rejects a mismatched-length signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(secret, "v0=short", ts, body)).toBe(false);
  });

  it("rejects an empty signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(secret, "", ts, body)).toBe(false);
  });
});
