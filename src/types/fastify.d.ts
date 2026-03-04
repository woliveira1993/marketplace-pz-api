import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: number;
    tenantSlug: string;
  }
}

export interface JwtPayload {
  tenantId: number;
  slug: string;
  email: string;
}
