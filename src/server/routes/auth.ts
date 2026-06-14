import type { FastifyInstance } from "fastify";
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
  app.post("/api/auth/setup", async (request, reply) => {
    if (hasAdminUser()) return reply.code(409).send({ error: "Setup is already complete" });
    const body = credentialSchema.parse(request.body);
    await createAdminUser(body.username, body.password);
    const userId = await authenticate(body.username, body.password);
    const token = createSession(userId!);
    return setSession(reply, token).send({ setupComplete: true, authenticated: true });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = credentialSchema.parse(request.body);
    const userId = await authenticate(body.username, body.password);
    if (!userId) return reply.code(401).send({ error: "Invalid username or password" });
    const token = createSession(userId);
    return setSession(reply, token).send({ authenticated: true });
  });

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

  app.post("/api/auth/password", async (request, reply) => {
    const userId = findSessionUser(request.cookies?.[sessionCookieName]);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const body = passwordChangeSchema.parse(request.body);
    if (body.currentPassword === body.newPassword) {
      return reply.code(400).send({ error: "New password must be different from current password" });
    }

    const changed = await changeUserPassword(userId, body.currentPassword, body.newPassword);
    if (!changed) return reply.code(401).send({ error: "Current password is incorrect" });
    return { changed: true };
  });
}

function setSession(reply: import("fastify").FastifyReply, token: string) {
  return reply.setCookie(sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: 60 * 60 * 24 * 30
  });
}
