import type { FastifyReply, FastifyRequest } from "fastify";
import { findSessionUser, hasAdminUser } from "./db/repositories.js";

export const sessionCookieName = "haai_session";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!hasAdminUser()) return;
  const token = request.cookies?.[sessionCookieName];
  const userId = findSessionUser(token);
  if (!userId) {
    await reply.code(401).send({ error: "Authentication required" });
  }
}
