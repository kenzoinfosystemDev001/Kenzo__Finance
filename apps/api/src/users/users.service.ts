import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type { RequestContext } from '../auth/auth.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { ROLE_CODES } from '../common/authz/permissions';
import { buildPaginatedResult } from '../common/dto/pagination.dto';
import { assertCanAssignRoles, assertCanManageUser, escalation, isSuperAdmin } from './user-rules';
import type { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto/user.dto';

type Tx = Prisma.TransactionClient;

/** Never select passwordHash: user rows leave this service as-is. */
const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { assignedAt: true, role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  private shape(u: UserRow) {
    const { roles, ...rest } = u;
    return {
      ...rest,
      locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      roles: roles.map((r) => ({ ...r.role, assignedAt: r.assignedAt })),
    };
  }

  async findAll(q: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      archivedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.roleCode ? { roles: { some: { role: { code: q.roleCode } } } } : {}),
      ...(q.search
        ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: [{ [q.sortBy]: { sort: q.sortDir, nulls: 'last' } }, { id: 'asc' }], skip: q.skip, take: q.take }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(rows.map((r) => this.shape(r)), total, q.page, q.pageSize);
  }

  async summary() {
    const grouped = await this.prisma.user.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } });
    const count = (s: UserStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return { total: grouped.reduce((n, g) => n + g._count._all, 0), active: count(UserStatus.ACTIVE), inactive: count(UserStatus.INACTIVE), locked: count(UserStatus.LOCKED) };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, archivedAt: null }, select: USER_SELECT });
    if (!user) throw new NotFoundException(`User ${id} was not found`);
    const permissions = await this.prisma.permission.findMany({
      where: { roles: { some: { role: { users: { some: { userId: id } } } } } },
      select: { code: true, module: true, action: true, description: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return { ...this.shape(user), permissions };
  }

  async activity(id: string, page = 1, pageSize = 25) {
    await this.findOne(id);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: 'User', entityId: id }, { actorUserId: id, action: { startsWith: 'auth.' } }] };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, action: true, summary: true, createdAt: true, ipAddress: true, actor: { select: { id: true, fullName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  /** Roles by code with their permission codes; unknown codes are a 400. */
  private async loadRoles(codes: string[], tx: Tx | PrismaService = this.prisma) {
    const unique = [...new Set(codes)];
    const roles = await tx.role.findMany({ where: { code: { in: unique } }, select: { id: true, code: true, name: true, permissions: { select: { permission: { select: { code: true } } } } } });
    const missing = unique.filter((c) => !roles.some((r) => r.code === c));
    if (missing.length) throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name, permissions: r.permissions.map((p) => p.permission.code) }));
  }

  /** Target's current role codes (row-locked so concurrent edits serialize). */
  private async lockTarget(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${id}::uuid AND "archivedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw new NotFoundException(`User ${id} was not found`);
    const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { ...USER_SELECT } });
    return { user, roles: user.roles.map((r) => r.role.code) };
  }

  /** At least one active Super Admin must remain. Serialised by locking all super-admin rows. */
  private async assertNotLastSuperAdmin(tx: Tx, targetId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur."userId" = u.id
      JOIN roles r ON r.id = ur."roleId"
      WHERE r.code = ${ROLE_CODES.SUPER_ADMIN} AND u.status = 'ACTIVE' AND u."archivedAt" IS NULL
      FOR UPDATE OF u`;
    if (!rows.some((r) => r.id !== targetId)) throw new ConflictException('This is the last active Super Admin. Assign the role to another active user first.');
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser, context: RequestContext) {
    const roles = await this.loadRoles(dto.roleCodes);
    assertCanAssignRoles(actor, roles);
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: dto.email, fullName: dto.fullName, phone: dto.phone ?? null, passwordHash, status: UserStatus.ACTIVE, roles: { create: roles.map((r) => ({ roleId: r.id })) } },
          select: USER_SELECT,
        });
        await this.audit.record(
          { actorUserId: actor.id, action: 'user.create', entityType: 'User', entityId: created.id, summary: `Created user ${created.email} with role(s) ${roles.map((r) => r.code).join(', ')}`, after: { email: created.email, fullName: created.fullName, phone: created.phone, roles: roles.map((r) => r.code) }, ...context },
          tx,
        );
        return created;
      });
      return this.shape(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A user with this email address already exists.');
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser, context: RequestContext) {
    const newRoles = dto.roleCodes ? await this.loadRoles(dto.roleCodes) : null;
    const user = await this.prisma.$transaction(async (tx) => {
      const { user: before, roles: current } = await this.lockTarget(tx, id);
      const target = { id, roles: current };
      assertCanManageUser(actor, target, 'profile');
      let rolesChanged = false;
      if (newRoles) {
        const next = newRoles.map((r) => r.code).sort();
        rolesChanged = next.join() !== [...current].sort().join();
        if (rolesChanged) {
          assertCanManageUser(actor, target, 'roles');
          // Only roles being added need the escalation check; removing access is always allowed.
          assertCanAssignRoles(actor, newRoles.filter((r) => !current.includes(r.code)));
          const removed = current.filter((c) => !next.includes(c));
          if (removed.length && !isSuperAdmin(actor)) {
            const removedRoles = await this.loadRoles(removed, tx);
            assertCanAssignRoles(actor, removedRoles); // cannot strip roles above your own level
          }
          if (current.includes(ROLE_CODES.SUPER_ADMIN) && !next.includes(ROLE_CODES.SUPER_ADMIN)) await this.assertNotLastSuperAdmin(tx, id);
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.createMany({ data: newRoles.map((r) => ({ userId: id, roleId: r.id })) });
        }
      }
      const data: Prisma.UserUpdateInput = {};
      if (dto.fullName !== undefined && dto.fullName !== before.fullName) data.fullName = dto.fullName;
      if (dto.phone !== undefined && (dto.phone ?? null) !== before.phone) data.phone = dto.phone ?? null;
      if (!rolesChanged && Object.keys(data).length === 0) return before;
      const after = await tx.user.update({ where: { id }, data, select: USER_SELECT });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: rolesChanged ? 'user.roles.update' : 'user.update',
          entityType: 'User',
          entityId: id,
          summary: rolesChanged ? `Roles of ${after.email}: ${current.join(', ') || 'none'} → ${newRoles!.map((r) => r.code).join(', ')}` : `Updated ${after.email}`,
          before: { fullName: before.fullName, phone: before.phone, roles: current },
          after: { fullName: after.fullName, phone: after.phone, roles: after.roles.map((r) => r.role.code) },
          ...context,
        },
        tx,
      );
      return after;
    });
    return this.shape(user);
  }

  async setStatus(id: string, active: boolean, reason: string | undefined, actor: AuthenticatedUser, context: RequestContext) {
    const user = await this.prisma.$transaction(async (tx) => {
      const { user: before, roles } = await this.lockTarget(tx, id);
      assertCanManageUser(actor, { id, roles }, 'status');
      if (!active && before.status === UserStatus.INACTIVE) throw new BadRequestException('The user is already inactive.');
      if (active && before.status === UserStatus.ACTIVE && !(before.lockedUntil && before.lockedUntil > new Date())) throw new BadRequestException('The user is already active.');
      if (!active && roles.includes(ROLE_CODES.SUPER_ADMIN)) await this.assertNotLastSuperAdmin(tx, id);
      const after = await tx.user.update({
        where: { id },
        data: active ? { status: UserStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null } : { status: UserStatus.INACTIVE },
        select: USER_SELECT,
      });
      // Deactivation ends every session now; the access-token guard also re-checks status on each request.
      if (!active) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: active ? 'user.activate' : 'user.deactivate',
          entityType: 'User',
          entityId: id,
          summary: `${active ? 'Activated' : 'Deactivated'} ${after.email}${reason ? `: ${reason}` : ''}${active ? '' : '; all sessions revoked'}`,
          before: { status: before.status },
          after: { status: after.status },
          ...context,
        },
        tx,
      );
      return after;
    });
    return this.shape(user);
  }

  async resetPassword(id: string, password: string, actor: AuthenticatedUser, context: RequestContext) {
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const { user, roles } = await this.lockTarget(tx, id);
      assertCanManageUser(actor, { id, roles }, 'password');
      await tx.user.update({ where: { id }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: actor.id, action: 'user.password.reset', entityType: 'User', entityId: id, summary: `Password reset for ${user.email} by an administrator; all sessions revoked`, ...context }, tx);
    });
    return { reset: true };
  }

  // ------------------------------------------------------------------ roles

  async roles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, description: true, isSystem: true, _count: { select: { users: { where: { user: { archivedAt: null } } } } }, permissions: { select: { permission: { select: { code: true } } } } },
    });
    return roles.map(({ _count, permissions, ...r }) => ({ ...r, userCount: _count.users, permissions: permissions.map((p) => p.permission.code).sort() }));
  }

  async permissionCatalogue() {
    return this.prisma.permission.findMany({ select: { code: true, module: true, action: true, description: true }, orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  async setRolePermissions(roleId: string, codes: string[], actor: AuthenticatedUser, context: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, code: true, name: true, permissions: { select: { permission: { select: { code: true } } } } } });
    if (!role) throw new NotFoundException(`Role ${roleId} was not found`);
    if (role.code === ROLE_CODES.SUPER_ADMIN) throw new ForbiddenException('The Super Admin role always holds every permission and cannot be edited.');
    if (!isSuperAdmin(actor) && actor.roles.includes(role.code)) throw new ForbiddenException('You cannot edit the permissions of a role you hold.');
    const wanted = [...new Set(codes)];
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: wanted } }, select: { id: true, code: true } });
    const unknown = wanted.filter((c) => !permissions.some((p) => p.code === c));
    if (unknown.length) throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    const current = role.permissions.map((p) => p.permission.code);
    const added = wanted.filter((c) => !current.includes(c));
    const removed = current.filter((c) => !wanted.includes(c));
    // Both directions: you can neither grant nor revoke access you do not hold yourself.
    const missing = escalation(actor, [...added, ...removed]);
    if (missing.length) throw new ForbiddenException(`You cannot change access you do not hold yourself (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}).`);
    if (!added.length && !removed.length) return (await this.roles()).find((r) => r.id === roleId);
    await this.prisma.$transaction(async (tx) => {
      if (removed.length) await tx.rolePermission.deleteMany({ where: { roleId, permission: { code: { in: removed } } } });
      if (added.length) await tx.rolePermission.createMany({ data: permissions.filter((p) => added.includes(p.code)).map((p) => ({ roleId, permissionId: p.id })), skipDuplicates: true });
      await this.audit.record(
        { actorUserId: actor.id, action: 'role.permissions.update', entityType: 'Role', entityId: roleId, summary: `${role.name}: +${added.length} / -${removed.length} permission(s)`, before: { permissions: current }, after: { added, removed }, ...context },
        tx,
      );
    });
    return (await this.roles()).find((r) => r.id === roleId);
  }
}
