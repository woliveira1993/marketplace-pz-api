import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export default fp(async function rateLimitPlugin(fastify: FastifyInstance) {
  fastify.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Muitas requisições. Aguarde antes de tentar novamente.',
    }),
  });
});
