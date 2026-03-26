import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AttendanceService } from './attendance.service';
import { AttendanceStatus, SessionStatus } from '../../generated/prisma/enums';

type AttendanceRecord = {
  id: string;
  sessionId: string;
  userId: string;
  status: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  remarks: string | null;
  source: string | null;
};

describe('AttendanceService manual attendance', () => {
  const repEmail = 'rep@test.com';
  const sessionId = 'session-1';
  const lecturerId = 'lecturer-1';

  const buildSession = () => ({
    id: sessionId,
    status: SessionStatus.OPEN,
    courseId: null,
    moduleId: null,
    lecturerId,
    endTime: new Date('2026-03-24T10:00:00.000Z'),
    course: null,
    module: null,
    subtopic: { lecturerId, lecturer: null },
  });

  const buildLecturer = (id = lecturerId) => ({
    id,
    email: `${id}@test.com`,
    student: null,
    lecturer: { id: `lecturer-profile-${id}` },
  });

  const createHarness = () => {
    const attendanceStore = new Map<string, AttendanceRecord>();
    const session = buildSession();
    const users = new Map<string, ReturnType<typeof buildLecturer>>();

    users.set(lecturerId, buildLecturer(lecturerId));

    const prisma = {
      session: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id !== sessionId) {
            return null;
          }
          return session;
        }),
      },
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return users.get(where.id) ?? null;
        }),
      },
      attendance: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { sessionId_userId: { sessionId: string; userId: string } };
          }) => {
            const key = `${where.sessionId_userId.sessionId}:${where.sessionId_userId.userId}`;
            return attendanceStore.get(key) ?? null;
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            update,
            create,
          }: {
            where: { sessionId_userId: { sessionId: string; userId: string } };
            update: Partial<AttendanceRecord>;
            create: Partial<AttendanceRecord>;
          }) => {
            const key = `${where.sessionId_userId.sessionId}:${where.sessionId_userId.userId}`;
            const existing = attendanceStore.get(key);
            const payload = existing
              ? ({ ...existing, ...update } as AttendanceRecord)
              : ({
                  id: `att-${attendanceStore.size + 1}`,
                  sessionId: where.sessionId_userId.sessionId,
                  userId: where.sessionId_userId.userId,
                  status: create.status ?? AttendanceStatus.ABSENT,
                  checkInTime: create.checkInTime ?? null,
                  checkOutTime: create.checkOutTime ?? null,
                  remarks: create.remarks ?? null,
                  source: create.source ?? null,
                } as AttendanceRecord);

            attendanceStore.set(key, payload);
            return payload;
          },
        ),
      },
    };

    const helper = {
      getUser: jest.fn(async (email: string) => {
        if (email === repEmail) {
          return {
            id: 'rep-1',
            email: repEmail,
            role: 'REP',
          };
        }

        throw new NotFoundException('User not found');
      }),
      createUserLog: jest.fn(async () => undefined),
      createSystemLog: jest.fn(async () => undefined),
    };

    const service = new AttendanceService(prisma as any, helper as any);

    return {
      service,
      prisma,
      helper,
      users,
      attendanceStore,
      session,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-24T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('Check-In only creates checkInTime and CHECKED_IN status', async () => {
    const { service } = createHarness();

    const result = await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_IN,
      undefined,
      repEmail,
    );

    expect(result.status).toBe(AttendanceStatus.CHECKED_IN);
    expect(result.checkInTime).toEqual(new Date('2026-03-24T09:00:00.000Z'));
    expect(result.checkOutTime).toBeNull();
  });

  it('Check-Out only creates checkOutTime and CHECKED_OUT status', async () => {
    const { service } = createHarness();

    const result = await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_OUT,
      undefined,
      repEmail,
    );

    expect(result.status).toBe(AttendanceStatus.CHECKED_OUT);
    expect(result.checkInTime).toBeNull();
    expect(result.checkOutTime).toEqual(new Date('2026-03-24T09:00:00.000Z'));
  });

  it('Check-In then Check-Out becomes PRESENT automatically', async () => {
    const { service } = createHarness();

    await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_IN,
      undefined,
      repEmail,
    );

    jest.setSystemTime(new Date('2026-03-24T09:45:00.000Z'));

    const result = await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_OUT,
      undefined,
      repEmail,
    );

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(result.checkInTime).toEqual(new Date('2026-03-24T09:00:00.000Z'));
    expect(result.checkOutTime).toEqual(new Date('2026-03-24T09:45:00.000Z'));
  });

  it('Manual edit of both times persists and sets PRESENT', async () => {
    const { service } = createHarness();

    const result = await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.PRESENT,
      'Adjusted after late update',
      repEmail,
      new Date('2026-03-24T08:15:00.000Z'),
      new Date('2026-03-24T09:40:00.000Z'),
    );

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(result.checkInTime).toEqual(new Date('2026-03-24T08:15:00.000Z'));
    expect(result.checkOutTime).toEqual(new Date('2026-03-24T09:40:00.000Z'));
  });

  it('Checkout after session end computes overtime', async () => {
    const { service } = createHarness();

    await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_IN,
      undefined,
      repEmail,
      new Date('2026-03-24T09:00:00.000Z'),
      undefined,
    );

    const result = await service.markManualAttendance(
      sessionId,
      lecturerId,
      AttendanceStatus.CHECKED_OUT,
      undefined,
      repEmail,
      undefined,
      new Date('2026-03-24T11:30:00.000Z'),
    );

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(result.overtimeMinutes).toBe(90);
    expect(result.overtimeHours).toBe(1.5);
  });

  it('Invalid time order is rejected', async () => {
    const { service } = createHarness();

    await expect(
      service.markManualAttendance(
        sessionId,
        lecturerId,
        AttendanceStatus.PRESENT,
        undefined,
        repEmail,
        new Date('2026-03-24T12:00:00.000Z'),
        new Date('2026-03-24T11:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Bulk update handles mixed success/errors', async () => {
    const { service } = createHarness();

    const result = await service.markBulkManualAttendance(
      sessionId,
      [
        {
          userId: lecturerId,
          status: AttendanceStatus.CHECKED_IN,
          startTime: '2026-03-24T09:00:00.000Z',
        },
        {
          userId: 'unknown-user',
          status: AttendanceStatus.CHECKED_IN,
        },
      ],
      repEmail,
    );

    expect(result.totalProcessed).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].userId).toBe('unknown-user');
  });

  it('Non-admin cannot mark unassigned lecturer', async () => {
    const { service, users } = createHarness();

    users.set('lecturer-2', buildLecturer('lecturer-2'));

    await expect(
      service.markManualAttendance(
        sessionId,
        'lecturer-2',
        AttendanceStatus.CHECKED_IN,
        undefined,
        repEmail,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
