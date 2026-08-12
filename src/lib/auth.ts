/**
 * Xác thực & phân quyền.
 *  - Mật khẩu băm bcrypt, JWT ký HS256 (jose), lưu trong cookie httpOnly.
 *  - RBAC 8 role theo specs §10.5; guard dùng chung cho mọi route handler.
 */
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { ApiError } from '@/lib/http';

export const SESSION_COOKIE = 'olympiad_session';

const BCRYPT_ROUNDS = 10;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error('AUTH_SECRET chưa được cấu hình (cần chuỗi ngẫu nhiên >= 24 ký tự).');
  }
  return new TextEncoder().encode(secret);
}

function ttlHours(): number {
  return Number(process.env.AUTH_TOKEN_TTL_HOURS ?? 72);
}

export interface SessionUser {
  id: string;
  fullName: string;
  email: string | null;
  roles: Role[];
}

// ---------------------------------------------------------------------------
// Mật khẩu
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.fullName, email: user.email, roles: user.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours()}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      fullName: String(payload.name ?? ''),
      email: (payload.email as string | null) ?? null,
      roles: Array.isArray(payload.roles) ? (payload.roles as Role[]) : [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie phiên
// ---------------------------------------------------------------------------

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttlHours() * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Phiên hiện tại, hoặc null nếu chưa đăng nhập. Dùng được trong Server Component và route handler. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw ApiError.unauthorized();
  return session;
}

export function hasRole(user: SessionUser, ...roles: Role[]): boolean {
  return user.roles.some((role) => roles.includes(role));
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const session = await requireSession();
  if (!hasRole(session, ...roles)) throw ApiError.forbidden();
  return session;
}

/** Nhóm quyền thường dùng. */
export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN', 'PROGRAM_MANAGER'];
export const CONTENT_ROLES: Role[] = ['SUPER_ADMIN', 'PROGRAM_MANAGER', 'REVIEWER', 'CONTENT_EDITOR'];
/** Chỉ các role này được chuyển câu hỏi sang PUBLISHED (specs §5.3). */
export const PUBLISH_ROLES: Role[] = ['SUPER_ADMIN', 'PROGRAM_MANAGER', 'REVIEWER'];

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(...ADMIN_ROLES);
}

export async function requireContentStaff(): Promise<SessionUser> {
  return requireRole(...CONTENT_ROLES);
}

export async function requireTeacher(): Promise<SessionUser> {
  return requireRole('TEACHER', 'SUPER_ADMIN', 'PROGRAM_MANAGER');
}

export async function requireStudent(): Promise<SessionUser> {
  return requireRole('STUDENT');
}
