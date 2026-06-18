import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sessionCookieName } from "../auth.js";
import {
  authenticate,
  changeUserPassword,
  createAdminUser,
  createSession,
  deleteSession,
  findSessionUser,
  findUserById,
  hasAdminUser
} from "../db/repositories.js";

const credentialSchema = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(8).max(200)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(8).max(200)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/setup",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      if (hasAdminUser()) return reply.code(409).send({ error: "Setup is already complete" });
      const body = credentialSchema.parse(request.body);
      await createAdminUser(body.username, body.password);
      const userId = await authenticate(body.username, body.password);
      const token = createSession(userId!);
      return setSession(request, reply, token).send({ setupComplete: true, authenticated: true });
    }
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = credentialSchema.parse(request.body);
      const userId = await authenticate(body.username, body.password);
      if (!userId) return reply.code(401).send({ error: "Invalid username or password" });
      const token = createSession(userId);
      return setSession(request, reply, token).send({ authenticated: true });
    }
  );

  app.post("/api/auth/logout", async (request, reply) => {
    deleteSession(request.cookies?.[sessionCookieName]);
    return reply.clearCookie(sessionCookieName, { path: "/" }).send({ authenticated: false });
  });

  app.get("/api/auth/me", async (request) => {
    const setupComplete = hasAdminUser();
    const userId = setupComplete ? findSessionUser(request.cookies?.[sessionCookieName]) : null;
    const user = userId ? findUserById(userId) : null;
    return { setupComplete, authenticated: Boolean(userId), username: user?.username };
  });

  app.post(
    "/api/auth/password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const userId = findSessionUser(request.cookies?.[sessionCookieName]);
      if (!userId) return reply.code(401).send({ error: "Authentication required" });

      const body = passwordChangeSchema.parse(request.body);
      if (body.currentPassword === body.newPassword) {
        return reply.code(400).send({ error: "New password must be different from current password" });
      }

      const changed = await changeUserPassword(userId, body.currentPassword, body.newPassword);
      if (!changed) return reply.code(401).send({ error: "Current password is incorrect" });
      return { changed: true };
    }
  );
}

function setSession(request: FastifyRequest, reply: FastifyReply, token: string) {
  return reply.setCookie(sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(request),
    maxAge: 60 * 60 * 24 * 30
  });
}

function shouldUseSecureCookie(request: FastifyRequest): boolean {
  const configured = process.env.HAAI_COOKIE_SECURE?.trim().toLowerCase();
  if (configured && ["1", "true", "yes", "on"].includes(configured)) return true;
  if (configured && ["0", "false", "no", "off"].includes(configured)) return false;

  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedValues = Array.isArray(forwardedProto) ? forwardedProto : [forwardedProto];
  if (
    forwardedValues
      .filter((value): value is string => Boolean(value))
      .some((value) => value.split(",").map((item) => item.trim().toLowerCase()).includes("https"))
  ) {
    return true;
  }
  return request.protocol === "https";
}
