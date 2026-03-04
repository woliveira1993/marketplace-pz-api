import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
