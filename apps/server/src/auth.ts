import jwt from 'jsonwebtoken';
import { z } from 'zod';

const claimsSchema = z.object({
  sub: z.string(),
  name: z.string(),
});

export interface AuthUser {
  id: string;
  name: string;
}

export function signToken(user: AuthUser, secret: string): string {
  return jwt.sign({ name: user.name }, secret, {
    subject: user.id,
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

export function verifyToken(token: string, secret: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return { id: claims.data.sub, name: claims.data.name };
  } catch {
    return null;
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
