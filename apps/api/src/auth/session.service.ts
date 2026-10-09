import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { isDevelopment } from '../config/runtime.js';
import type { Grant, Principal } from './auth.types.js';

const ISSUER = 'crito-cms';
const AUDIENCE = 'crito-cms-admin';
/** Короткая сессия: права в LMS перепроверяются при каждом обновлении. */
const SESSION_TTL_SECONDS = 15 * 60;

interface SessionClaims {
  email: string;
  name?: string;
  sa: boolean;
  grants: Grant[];
}

@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService) {
    const secret = config.get<string>('SESSION_SECRET');
    // Значение по умолчанию допустимо только в разработке; на проде конфигурацию проверяет validateEnvironment.
    if ((!secret || secret === 'change-me') && !isDevelopment()) {
      throw new Error('SESSION_SECRET не задан');
    }
    this.key = new TextEncoder().encode(secret ?? 'change-me');
  }

  async issue(principal: Principal): Promise<{ token: string; expiresIn: number }> {
    const claims: SessionClaims = {
      email: principal.email,
      name: principal.name,
      sa: principal.isSuperAdmin,
      grants: principal.grants,
    };
    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(principal.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(this.key);
    return { token, expiresIn: SESSION_TTL_SECONDS };
  }

  async verify(token: string): Promise<Principal | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (!payload.sub) return null;
      const claims = payload as unknown as SessionClaims;
      return {
        userId: payload.sub,
        email: claims.email,
        name: claims.name,
        isSuperAdmin: claims.sa === true,
        grants: Array.isArray(claims.grants) ? claims.grants : [],
      };
    } catch {
      return null;
    }
  }
}
