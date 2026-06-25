import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, DEV_ACCESS_TOKEN, DEV_USER_ID } from "./config.js";

// Cache the resolved user id on the request so the rate-limit hook and the
// route's authenticate() do not verify the same token twice.
declare module "fastify" {
  interface FastifyRequest {
    authUserId?: string | null;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let localSecret: Uint8Array | null = null;

/**
 * Verify the bearer token and return its subject, or null if there is no token
 * or it is invalid/expired. This NEVER throws, so it is safe to call from an
 * onRequest hook (used to key the rate limiter on the real user id rather than a
 * client-controlled header). Authoritative rejection is done by authenticate().
 */
export async function resolveUserId(request: FastifyRequest): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);

  // The dev bypass token is only honored when explicitly enabled and never in
  // production. With local auth on by default this path is effectively off.
  if (config.devAuth && config.nodeEnv !== "production" && token === DEV_ACCESS_TOKEN) {
    return DEV_USER_ID;
  }

  try {
    if (config.authMode === "local") {
      localSecret ??= new TextEncoder().encode(config.localAuthSecret);
      const verified = await jwtVerify(token, localSecret, { algorithms: ["HS256"] });
      return verified.payload.sub ?? null;
    }
    if (!config.supabaseUrl) return null;
    jwks ??= createRemoteJWKSet(new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`));
    const verified = await jwtVerify(token, jwks, {
      issuer: `${config.supabaseUrl}/auth/v1`,
      audience: "authenticated"
    });
    return verified.payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function authenticate(request: FastifyRequest): Promise<string> {
  // Reuse the value resolved by the rate-limit onRequest hook when present, so a
  // normal request verifies its token exactly once.
  if (request.authUserId) return request.authUserId;

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401, code: "AUTH_REQUIRED" });
  }
  if (config.authMode !== "local" && !config.supabaseUrl) {
    throw Object.assign(new Error("Authentication is not configured"), { statusCode: 503, code: "AUTH_UNAVAILABLE" });
  }
  // A bearer was present. If the hook already resolved it to null, fail closed;
  // otherwise (the hook did not run) resolve it once here.
  const userId = request.authUserId === null ? null : await resolveUserId(request);
  if (!userId) {
    throw Object.assign(new Error("Invalid identity token"), { statusCode: 401, code: "AUTH_INVALID" });
  }
  return userId;
}
