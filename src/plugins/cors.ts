import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export default fp(async function corsPlugin(fastify: FastifyInstance) {
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim());

  fastify.register(fastifyCors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
});
