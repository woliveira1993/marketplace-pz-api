import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export default fp(async function jwtPlugin(fastify: FastifyInstance) {
  fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });
});
