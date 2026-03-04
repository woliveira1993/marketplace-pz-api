import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../hooks/authenticate.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema.js';
import {
  registerTenant,
  loginTenant,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from './auth.service.js';
import type { JwtPayload } from '../../types/fastify.js';

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: result.error.flatten().fieldErrors,
      });
    }

    try {
      const tenant = await registerTenant(result.data);
      const refreshToken = await createRefreshToken(tenant.id);
      const payload: JwtPayload = { tenantId: tenant.id, slug: tenant.slug, email: tenant.email };
      const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });

      return reply.code(201).send({
        accessToken,
        refreshToken,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, email: tenant.email },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'EMAIL_IN_USE') {
        return reply.code(409).send({ error: 'Email já cadastrado' });
      }
      if (message === 'SLUG_IN_USE') {
        return reply.code(409).send({ error: 'Slug já em uso. Escolha outro identificador.' });
      }
      fastify.log.error(err, 'Register error');
      return reply.code(500).send({ error: 'Erro interno ao registrar conta' });
    }
  });

  // POST /api/auth/login
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Email e senha são obrigatórios' });
    }

    try {
      const tenant = await loginTenant(result.data);
      const refreshToken = await createRefreshToken(tenant.id);
      const payload: JwtPayload = { tenantId: tenant.id, slug: tenant.slug, email: tenant.email };
      const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });

      return reply.send({
        accessToken,
        refreshToken,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, email: tenant.email },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'INVALID_CREDENTIALS') {
        return reply.code(401).send({ error: 'Email ou senha inválidos' });
      }
      if (message === 'ACCOUNT_INACTIVE') {
        return reply.code(403).send({ error: 'Conta desativada' });
      }
      fastify.log.error(err, 'Login error');
      return reply.code(500).send({ error: 'Erro interno ao fazer login' });
    }
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'refreshToken é obrigatório' });
    }

    try {
      const { tenant, newToken } = await rotateRefreshToken(result.data.refreshToken);
      const payload: JwtPayload = { tenantId: tenant.id, slug: tenant.slug, email: tenant.email };
      const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });

      return reply.send({ accessToken, refreshToken: newToken });
    } catch {
      return reply.code(401).send({ error: 'Refresh token inválido ou expirado' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = refreshSchema.safeParse(request.body);
    if (result.success) {
      await revokeRefreshToken(result.data.refreshToken);
    }
    return reply.send({ message: 'Logout realizado com sucesso' });
  });
}
