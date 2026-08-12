/**
 * Sự kiện tracking — danh sách chuẩn theo specs §13.2.
 * Tên event là hằng số để dashboard và code không lệch nhau.
 */
import { prisma } from '@/lib/prisma';

export const EVENTS = {
  VIEW_PROGRAM: 'view_program',
  START_CHECKOUT: 'start_checkout',
  PURCHASE_SUCCESS: 'purchase_success',
  DIAGNOSTIC_STARTED: 'diagnostic_started',
  ITEM_ANSWERED: 'item_answered',
  DIAGNOSTIC_COMPLETED: 'diagnostic_completed',
  GOAL_CREATED: 'goal_created',
  STUDY_DAY_STARTED: 'study_day_started',
  STUDY_DAY_COMPLETED: 'study_day_completed',
  SOLUTION_VIEWED: 'solution_viewed',
  ASSESSMENT_COMPLETED: 'assessment_completed',
  TEACHER_SESSION_BOOKED: 'teacher_session_booked',
  TEACHER_SESSION_COMPLETED: 'teacher_session_completed',
  RECOMMENDATION_CHANGED: 'recommendation_changed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface TrackInput {
  eventName: EventName | string;
  userId?: string | null;
  enrollmentId?: string | null;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
}

/** Ghi 1 sự kiện. Lỗi analytics không bao giờ làm hỏng nghiệp vụ chính. */
export async function track(input: TrackInput): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventName: input.eventName,
        userId: input.userId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        properties: (input.properties ?? {}) as object,
        sessionId: input.sessionId ?? null,
      },
    });
  } catch (error) {
    console.error('[analytics] không ghi được sự kiện', input.eventName, error);
  }
}

/** Ghi nhiều sự kiện một lần (client gửi batch). */
export async function trackBatch(inputs: TrackInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.analyticsEvent.createMany({
      data: inputs.map((input) => ({
        eventName: input.eventName,
        userId: input.userId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        properties: (input.properties ?? {}) as object,
        sessionId: input.sessionId ?? null,
      })),
    });
  } catch (error) {
    console.error('[analytics] không ghi được batch sự kiện', error);
  }
}
