/**
 * RECOMMENDATION / PERSONALIZATION ENGINE — điểm truy cập duy nhất.
 *
 * Toàn bộ module khác import từ `@/engine`, không import trực tiếp file con.
 * Engine không biết gì về Prisma, Next.js hay LLM: vào là plain object, ra là
 * plain object kèm `reasonCode` cho mọi quyết định.
 */
export * from './types';
export * from './rng';
export * from './gap';
export * from './mastery';
export * from './difficulty';
export * from './day-plan';
export * from './feasibility';
export * from './selection';
export * from './scoring';
