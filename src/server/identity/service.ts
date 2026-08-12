/**
 * Identity/Auth — đăng ký, đăng nhập, OTP, đổi/quên mật khẩu, quản trị vai trò
 * (specs §6 module 1, §9.2 màn hình 3, §10.5).
 *
 * Service thuần nghiệp vụ: không biết gì về HTTP, lỗi nghiệp vụ ném ApiError.
 */
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Role, UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { hashPassword, signSession, verifyPassword, type SessionUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { gradeBandOf, ROLE_LABEL } from '@/lib/domain';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  assignRoleSchema,
  changePasswordSchema,
  createStaffUserSchema,
  listUsersSchema,
  loginSchema,
  registerStudentSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  splitIdentifier,
  updateStudentProfileSchema,
  type CreateStaffUserInput,
  type ListUsersFilter,
  type LoginInput,
  type OtpPurpose,
  type RegisterStudentInput,
  type ResetPasswordInput,
  type UpdateStudentProfileInput,
  setUserPasswordSchema,
  updateUserAccountSchema,
  type UpdateUserAccountInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Hằng số OTP — chốt trong specs §6, không nằm trong nhóm tham số admin sửa được
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

/**
 * Hash "mồi" để so sánh mật khẩu ngay cả khi không tìm thấy tài khoản.
 * Mục đích: thời gian phản hồi của email tồn tại và không tồn tại là như nhau
 * → không lộ danh sách tài khoản qua đo thời gian (specs §14).
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const CREDENTIALS_MESSAGE = 'Email/số điện thoại hoặc mật khẩu không đúng.';
const OTP_MESSAGE = 'Mã xác thực không đúng hoặc đã hết hạn.';

const AUDIT_ENTITY_USER = 'User';
const AUDIT_ACTION_STAFF_CREATE = 'user.create_staff';
const AUDIT_ACTION_PROFILE_UPDATE = 'user.profile_update';
const AUDIT_ACTION_PASSWORD_RESET = 'user.password_reset_by_admin';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu trả về
// ---------------------------------------------------------------------------

const userDetailInclude = {
  roles: true,
  studentProfile: true,
  teacherProfile: true,
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userDetailInclude }>;

/** Không bao giờ trả passwordHash ra khỏi service. */
export type UserDetail = Omit<UserWithRelations, 'passwordHash'>;

const userListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: true } },
  studentProfile: { select: { id: true, actualGrade: true, gradeBand: true, school: true } },
  teacherProfile: { select: { id: true, active: true, capacityPerCycle: true } },
} satisfies Prisma.UserSelect;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>;

export interface UserListResult {
  rows: UserListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RegisterStudentResult {
  userId: string;
  studentProfileId: string;
  token: string;
}

export interface LoginResult {
  token: string;
  user: SessionUser;
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

function toSessionUser(user: { id: string; fullName: string; email: string | null }, roles: Role[]): SessionUser {
  return { id: user.id, fullName: user.fullName, email: user.email, roles };
}

function identifierWhere(identifier: string): Prisma.UserWhereInput | null {
  const { email, phone } = splitIdentifier(identifier);
  const or: Prisma.UserWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  return or.length > 0 ? { OR: or } : null;
}

async function findUserByIdentifier(identifier: string): Promise<UserWithRelations | null> {
  const where = identifierWhere(identifier);
  if (!where) return null;
  return prisma.user.findFirst({ where, include: userDetailInclude });
}

async function assertContactAvailable(email?: string, phone?: string): Promise<void> {
  const or: Prisma.UserWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (or.length === 0) throw ApiError.badRequest('Cần ít nhất email hoặc số điện thoại để tạo tài khoản.');

  const existing = await prisma.user.findFirst({ where: { OR: or }, select: { email: true, phone: true } });
  if (!existing) return;
  if (email && existing.email === email) throw ApiError.conflict('Email này đã được đăng ký.');
  throw ApiError.conflict('Số điện thoại này đã được đăng ký.');
}

/** Ràng buộc unique của DB là chốt chặn cuối khi hai request đăng ký cùng lúc. */
function translateUniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? (error.meta?.target as string[]) : [];
    if (target.includes('phone')) throw ApiError.conflict('Số điện thoại này đã được đăng ký.');
    throw ApiError.conflict('Email này đã được đăng ký.');
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Đăng ký & đăng nhập
// ---------------------------------------------------------------------------

export async function registerStudent(input: RegisterStudentInput): Promise<RegisterStudentResult> {
  const data = registerStudentSchema.parse(input);

  await assertContactAvailable(data.email, data.phone);

  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        passwordHash,
        status: 'ACTIVE',
        roles: { create: { role: 'STUDENT' } },
        studentProfile: {
          create: {
            actualGrade: data.actualGrade,
            // Khối luôn suy ra từ lớp thực tế để nội dung và lớp không lệch nhau (specs §3.2)
            gradeBand: gradeBandOf(data.actualGrade),
            school: data.school ?? null,
            parentName: data.parentName ?? null,
            parentPhone: data.parentPhone ?? null,
            parentEmail: data.parentEmail ?? null,
          },
        },
      },
      include: { studentProfile: { select: { id: true } } },
    });

    if (!user.studentProfile) {
      throw ApiError.conflict('Không tạo được hồ sơ học sinh, vui lòng thử lại.');
    }

    const token = await signSession(toSessionUser(user, ['STUDENT']));
    return { userId: user.id, studentProfileId: user.studentProfile.id, token };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    translateUniqueViolation(error);
  }
}

export async function loginUser(input: LoginInput): Promise<LoginResult> {
  const data = loginSchema.parse(input);
  const user = await findUserByIdentifier(data.identifier);

  // So sánh cả khi không có tài khoản để thời gian phản hồi không tố cáo sự tồn tại
  const matched = await verifyPassword(data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matched) throw ApiError.unauthorized(CREDENTIALS_MESSAGE);

  if (user.status === 'SUSPENDED') {
    throw ApiError.forbidden('Tài khoản đang bị tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const roles = user.roles.map((entry) => entry.role);
  const sessionUser = toSessionUser(user, roles);
  const token = await signSession(sessionUser);
  return { token, user: sessionUser };
}

export async function getUserDetail(userId: string): Promise<UserDetail> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userDetailInclude });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, '0');
}

export async function createOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  // Chặn spam gửi mã cho cùng một tài khoản
  enforceRateLimit(`otp:${userId}:${purpose}`, RATE_LIMITS.OTP);

  const now = new Date();

  // Mỗi thời điểm chỉ một mã còn hiệu lực cho mỗi mục đích
  await prisma.otpCode.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateOtpCode();
  await prisma.otpCode.create({
    data: {
      userId,
      purpose,
      code,
      expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
    },
  });

  return code;
}

export async function verifyOtp(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;

  const now = new Date();
  const record = await prisma.otpCode.findFirst({
    where: { userId, purpose, code: trimmed, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return false;

  // Đánh dấu đã dùng ngay — mã chỉ có giá trị một lần
  const consumed = await prisma.otpCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) return false;

  if (purpose === 'VERIFY_EMAIL') {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: 'ACTIVE' },
    });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Quên mật khẩu / đổi mật khẩu
// ---------------------------------------------------------------------------

export interface PasswordResetRequestResult {
  sent: boolean;
  /** CHỈ có ở môi trường dev (chưa đấu nối SMS/email) để đội phát triển test được. */
  otp?: string;
  userId?: string;
}

export async function requestPasswordReset(identifier: string): Promise<PasswordResetRequestResult> {
  const data = requestPasswordResetSchema.parse({ identifier });
  const user = await findUserByIdentifier(data.identifier);

  // Luôn trả sent = true dù tài khoản không tồn tại → không cho dò danh sách tài khoản
  if (!user) return { sent: true };

  const code = await createOtp(user.id, 'RESET_PASSWORD');

  // HÀNH VI DEV: chưa có gateway SMS/email nên trả thẳng mã + in ra log.
  // Khi đấu nối gateway thật, bỏ nhánh này và chỉ gửi qua Notification module.
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    console.info(`[identity] OTP đặt lại mật khẩu cho user ${user.id}: ${code}`);
    return { sent: true, otp: code, userId: user.id };
  }

  return { sent: true, userId: user.id };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const data = resetPasswordSchema.parse(input);
  const user = await findUserByIdentifier(data.identifier);
  if (!user) throw ApiError.badRequest(OTP_MESSAGE);

  const valid = await verifyOtp(user.id, data.code, 'RESET_PASSWORD');
  if (!valid) throw ApiError.badRequest(OTP_MESSAGE);

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: user.status === 'PENDING' ? 'ACTIVE' : user.status },
  });
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const data = changePasswordSchema.parse({ oldPassword, newPassword });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  const matched = await verifyPassword(data.oldPassword, user.passwordHash);
  if (!matched) throw ApiError.badRequest('Mật khẩu hiện tại không đúng.');

  if (data.oldPassword === data.newPassword) {
    throw ApiError.badRequest('Mật khẩu mới phải khác mật khẩu hiện tại.');
  }

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

// ---------------------------------------------------------------------------
// Vai trò
// ---------------------------------------------------------------------------

async function loadRoles(userId: string): Promise<Role[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
  return rows.map((row) => row.role);
}

/** Giáo viên phải có TeacherProfile thì mới phân công học sinh được. */
async function ensureTeacherProfile(userId: string): Promise<void> {
  const existing = await prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;

  const config = await getConfig();
  await prisma.teacherProfile.create({
    data: { userId, capacityPerCycle: config.teacher.defaultCapacityPerCycle },
  });
}

export async function assignRole(userId: string, role: Role, actorId: string): Promise<void> {
  const data = assignRoleSchema.parse({ userId, role });

  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  const before = await loadRoles(data.userId);
  if (before.includes(data.role)) return;

  await prisma.userRole.create({ data: { userId: data.userId, role: data.role } });
  if (data.role === 'TEACHER') await ensureTeacherProfile(data.userId);

  const after = await loadRoles(data.userId);
  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
    entityType: AUDIT_ENTITY_USER,
    entityId: data.userId,
    before: { roles: before },
    after: { roles: after, added: data.role },
  });
}

export async function removeRole(userId: string, role: Role, actorId: string): Promise<void> {
  const data = assignRoleSchema.parse({ userId, role });

  const before = await loadRoles(data.userId);
  if (!before.includes(data.role)) return;

  // Không để hệ thống rơi vào trạng thái không còn ai quản trị được
  if (data.role === 'SUPER_ADMIN') {
    const remaining = await prisma.userRole.count({ where: { role: 'SUPER_ADMIN' } });
    if (remaining <= 1) {
      throw ApiError.conflict(`Phải còn ít nhất một tài khoản ${ROLE_LABEL.SUPER_ADMIN}.`);
    }
  }

  await prisma.userRole.deleteMany({ where: { userId: data.userId, role: data.role } });

  // Giữ TeacherProfile nhưng tắt hoạt động để lịch sử phân công và buổi tư vấn cũ không mất
  if (data.role === 'TEACHER') {
    await prisma.teacherProfile.updateMany({ where: { userId: data.userId }, data: { active: false } });
  }

  const after = await loadRoles(data.userId);
  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
    entityType: AUDIT_ENTITY_USER,
    entityId: data.userId,
    before: { roles: before },
    after: { roles: after, removed: data.role },
  });
}

// ---------------------------------------------------------------------------
// Quản trị người dùng
// ---------------------------------------------------------------------------

export async function listUsers(filter: ListUsersFilter = {}): Promise<UserListResult> {
  const { search, role, status, page, pageSize } = listUsersSchema.parse(filter);

  const where: Prisma.UserWhereInput = {};
  if (role) where.roles = { some: { role } };
  if (status) where.status = status;

  if (search) {
    const keyword = search.trim();
    const phone = keyword.replace(/[\s.\-()]/g, '');
    where.OR = [
      { fullName: { contains: keyword, mode: 'insensitive' } },
      { email: { contains: keyword, mode: 'insensitive' } },
      { phone: { contains: phone.length > 0 ? phone : keyword } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function createStaffUser(
  input: CreateStaffUserInput,
  actorId: string,
): Promise<string> {
  const data = createStaffUserSchema.parse(input);

  await assertContactAvailable(data.email, data.phone);

  const config = await getConfig();
  const passwordHash = await hashPassword(data.password);
  const roles = Array.from(new Set(data.roles));
  const isTeacher = roles.includes('TEACHER');

  try {
    const user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        passwordHash,
        status: 'ACTIVE',
        roles: { create: roles.map((role) => ({ role })) },
        ...(isTeacher
          ? {
              teacherProfile: {
                create: {
                  bio: data.bio ?? null,
                  subjects: data.subjects ?? [],
                  capacityPerCycle: data.capacityPerCycle ?? config.teacher.defaultCapacityPerCycle,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    await writeAudit({
      actorId,
      action: AUDIT_ACTION_STAFF_CREATE,
      entityType: AUDIT_ENTITY_USER,
      entityId: user.id,
      after: { fullName: data.fullName, email: data.email ?? null, phone: data.phone ?? null, roles },
    });

    return user.id;
  } catch (error) {
    translateUniqueViolation(error);
  }
}

export async function setUserStatus(userId: string, status: UserStatus, actorId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');
  if (user.status === status) return;

  await prisma.user.update({ where: { id: userId }, data: { status } });
  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
    entityType: AUDIT_ENTITY_USER,
    entityId: userId,
    before: { status: user.status },
    after: { status },
  });
}

/** Học sinh tự cập nhật hồ sơ (specs §9.2 màn hình 14). Đổi lớp thì khối tự tính lại. */
export async function updateStudentProfile(userId: string, input: UpdateStudentProfileInput): Promise<UserDetail> {
  const data = updateStudentProfileSchema.parse(input);

  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw ApiError.notFound('Tài khoản này chưa có hồ sơ học sinh.');

  await prisma.$transaction(async (tx) => {
    if (data.fullName) {
      await tx.user.update({ where: { id: userId }, data: { fullName: data.fullName } });
    }
    await tx.studentProfile.update({
      where: { id: profile.id },
      data: {
        ...(data.actualGrade !== undefined
          ? { actualGrade: data.actualGrade, gradeBand: gradeBandOf(data.actualGrade) }
          : {}),
        ...(data.school !== undefined ? { school: data.school } : {}),
        ...(data.parentName !== undefined ? { parentName: data.parentName } : {}),
        ...(data.parentPhone !== undefined ? { parentPhone: data.parentPhone } : {}),
        ...(data.parentEmail !== undefined ? { parentEmail: data.parentEmail } : {}),
      },
    });
  });

  await writeAudit({
    actorId: userId,
    action: AUDIT_ACTION_PROFILE_UPDATE,
    entityType: AUDIT_ENTITY_USER,
    entityId: userId,
    after: { ...data },
  });

  return getUserDetail(userId);
}

/**
 * Quản trị sửa họ tên / email / số điện thoại của một tài khoản.
 *
 * Vì sao cần: email và số điện thoại là thứ người dùng đăng nhập bằng. Gõ nhầm
 * một ký tự lúc tạo tài khoản là người đó vĩnh viễn không vào được, và trước khi
 * có hàm này thì cách duy nhất để sửa là vào thẳng database.
 */
export async function updateUserAccount(
  userId: string,
  input: UpdateUserAccountInput,
  actorId: string,
): Promise<UserDetail> {
  const data = updateUserAccountSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, phone: true },
  });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  const nextEmail = data.email === undefined ? user.email : data.email;
  const nextPhone = data.phone === undefined ? user.phone : data.phone;

  // Xóa cả hai là biến tài khoản thành không đăng nhập được bằng cách nào.
  if (!nextEmail && !nextPhone) {
    throw ApiError.badRequest('Tài khoản phải giữ lại ít nhất email hoặc số điện thoại.');
  }

  // Chỉ kiểm tra trùng với giá trị THỰC SỰ đổi — nếu không, lưu lại chính email
  // cũ của mình cũng bị báo "đã được đăng ký".
  const changedEmail = nextEmail && nextEmail !== user.email ? nextEmail : undefined;
  const changedPhone = nextPhone && nextPhone !== user.phone ? nextPhone : undefined;
  if (changedEmail || changedPhone) {
    const clash = await prisma.user.findFirst({
      where: {
        id: { not: userId },
        OR: [
          ...(changedEmail ? [{ email: changedEmail }] : []),
          ...(changedPhone ? [{ phone: changedPhone }] : []),
        ],
      },
      select: { email: true, phone: true },
    });
    if (clash) {
      if (changedEmail && clash.email === changedEmail) {
        throw ApiError.conflict('Email này đã được đăng ký cho tài khoản khác.');
      }
      throw ApiError.conflict('Số điện thoại này đã được đăng ký cho tài khoản khác.');
    }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.email !== undefined ? { email: nextEmail } : {}),
        ...(data.phone !== undefined ? { phone: nextPhone } : {}),
      },
    });
  } catch (error) {
    translateUniqueViolation(error);
  }

  await writeAudit({
    actorId,
    action: AUDIT_ACTION_PROFILE_UPDATE,
    entityType: AUDIT_ENTITY_USER,
    entityId: userId,
    before: { fullName: user.fullName, email: user.email, phone: user.phone },
    after: { fullName: data.fullName ?? user.fullName, email: nextEmail, phone: nextPhone },
  });

  return getUserDetail(userId);
}

/**
 * Quản trị đặt lại mật khẩu hộ, không cần mật khẩu cũ.
 *
 * KHÔNG ghi mật khẩu vào nhật ký — kể cả bản băm. Nhật ký chỉ ghi lại rằng việc
 * này đã xảy ra, ai làm và cho ai, để sau này còn truy được.
 */
export async function setUserPassword(
  userId: string,
  newPassword: string,
  actorId: string,
): Promise<void> {
  const { newPassword: password } = setUserPasswordSchema.parse({ newPassword });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy người dùng.');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  await writeAudit({
    actorId,
    action: AUDIT_ACTION_PASSWORD_RESET,
    entityType: AUDIT_ENTITY_USER,
    entityId: userId,
  });
}
