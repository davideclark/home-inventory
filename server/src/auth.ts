import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

const scryptAsync = promisify(scrypt);

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const hash = (await scryptAsync(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return timingSafeEqual(hash, expected);
}

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(secret);
}

export interface JwtPayload {
  sub: string;
  role: string;
  forcePasswordChange: boolean;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ role: payload.role, forcePasswordChange: payload.forcePasswordChange })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtSecret());
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, jwtSecret());
  return {
    sub: payload.sub as string,
    role: payload['role'] as string,
    forcePasswordChange: payload['forcePasswordChange'] as boolean,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
