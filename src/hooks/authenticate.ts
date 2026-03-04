import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '../types/fastify.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;
    request.tenantId = payload.tenantId;
    request.tenantSlug = payload.slug;
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Token inválido ou expirado' });
  }
}
