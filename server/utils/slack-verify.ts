import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const computed =
    "v0=" + createHmac("sha256", signingSecret).update(baseString).digest("hex");

  if (computed.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
