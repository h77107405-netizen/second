import { Router } from 'express';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authenticate, requireStudent } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';

const router = Router();
router.use(authenticate, requireStudent);

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/dashboard', asyncHandler(async (req, res) => {
  const studentId = req.user!.id;
  const { sql: sqlFn, count } = await import('drizzle-orm');

  // Get student's batches first (needed for scoped queries)
  const myBatches = await db.select({ batchId: schema.batchStudents.batchId })
    .from(schema.batchStudents).where(eq(schema.batchStudents.studentId, studentId));
  const batchIds = myBatches.map(b => b.batchId);

  const [recentResults, upcomingClasses, recentMaterials, myFees, upcomingAssignments, openDoubts, availableTests, attendanceSummary] = await Promise.all([
    // Recent graded test results
    db.select({
      id: schema.testResults.id, marksObtained: schema.testResults.marksObtained,
      percentage: schema.testResults.percentage, submittedAt: schema.testResults.submittedAt,
      testTitle: schema.tests.title, totalMarks: schema.tests.totalMarks,
    })
      .from(schema.testResults)
      .leftJoin(schema.tests, eq(schema.testResults.testId, schema.tests.id))
      .where(and(eq(schema.testResults.studentId, studentId), eq(schema.testResults.status, 'graded')))
      .orderBy(desc(schema.testResults.submittedAt))
      .limit(5),

    // Upcoming live classes in my batches
    batchIds.length > 0
      ? db.select({
          id: schema.liveClasses.id, title: schema.liveClasses.title,
          scheduledDate: schema.liveClasses.scheduledDate, scheduledTime: schema.liveClasses.scheduledTime,
          meetingLink: schema.liveClasses.meetingLink, status: schema.liveClasses.status,
          teacherName: schema.users.name, batchName: schema.batches.name,
        })
          .from(schema.liveClasses)
          .leftJoin(schema.users, eq(schema.liveClasses.teacherId, schema.users.id))
          .leftJoin(schema.batches, eq(schema.liveClasses.batchId, schema.batches.id))
          .where(and(eq(schema.liveClasses.status, 'scheduled'), inArray(schema.liveClasses.batchId, batchIds)))
          .orderBy(schema.liveClasses.scheduledDate)
          .limit(5)
      : Promise.resolve([]),

    // Recent materials
    db.select({
      id: schema.materials.id, title: schema.materials.title, fileType: schema.materials.fileType,
      fileName: schema.materials.fileName, fileUrl: schema.materials.fileUrl, createdAt: schema.materials.createdAt,
      uploaderName: schema.users.name,
    })
      .from(schema.materials)
      .leftJoin(schema.users, eq(schema.materials.uploadedBy, schema.users.id))
      .where(eq(schema.materials.visibility, true))
      .orderBy(desc(schema.materials.createdAt))
      .limit(5),

    // Fee status
    db.select({ finalAmount: schema.fees.finalAmount, dueDate: schema.fees.dueDate })
      .from(schema.fees)
      .where(eq(schema.fees.studentId, studentId))
      .limit(1),

    // Upcoming assignments (due in future) I haven't submitted yet
    batchIds.length > 0
      ? db.select({
          id: schema.assignments.id, title: schema.assignments.title,
          dueDate: schema.assignments.dueDate, totalMarks: schema.assignments.totalMarks,
          batchName: schema.batches.name, courseName: schema.courses.name,
        })
          .from(schema.assignments)
          .leftJoin(schema.batches, eq(schema.assignments.batchId, schema.batches.id))
          .leftJoin(schema.courses, eq(schema.assignments.courseId, schema.courses.id))
          .where(and(inArray(schema.assignments.batchId, batchIds), sqlFn`${schema.assignments.dueDate} > NOW()`))
          .orderBy(schema.assignments.dueDate)
          .limit(5)
      : Promise.resolve([]),

    // Open doubts count
    db.select({ total: count() })
      .from(schema.doubts)
      .where(and(eq(schema.doubts.studentId, studentId), eq(schema.doubts.status, 'open'))),

    // Published tests in my batches
    batchIds.length > 0
      ? db.select({ total: count() })
          .from(schema.tests)
          .where(and(inArray(schema.tests.batchId, batchIds), eq(schema.tests.status, 'published')))
      : Promise.resolve([{ total: 0 }]),

    // Attendance summary: present/total sessions in my batches
    batchIds.length > 0
      ? db.select({
          total: count(schema.attendanceRecords.id),
          present: sqlFn<number>`SUM(CASE WHEN ${schema.attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)`,
          late: sqlFn<number>`SUM(CASE WHEN ${schema.attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)`,
        })
          .from(schema.attendanceRecords)
          .innerJoin(schema.attendanceSessions, eq(schema.attendanceRecords.sessionId, schema.attendanceSessions.id))
          .where(and(eq(schema.attendanceRecords.studentId, studentId), inArray(schema.attendanceSessions.batchId, batchIds)))
      : Promise.resolve([{ total: 0, present: 0, late: 0 }]),
  ]);

  // Filter upcoming assignments to exclude already-submitted ones
  let pendingAssignments = upcomingAssignments;
  if (upcomingAssignments.length > 0) {
    const submittedIds = (await db.select({ assignmentId: schema.assignmentSubmissions.assignmentId })
      .from(schema.assignmentSubmissions)
      .where(and(
        eq(schema.assignmentSubmissions.studentId, studentId),
        inArray(schema.assignmentSubmissions.assignmentId, upcomingAssignments.map((a: any) => a.id))
      ))).map(s => s.assignmentId);
    pendingAssignments = upcomingAssignments.filter((a: any) => !submittedIds.includes(a.id));
  }

  const att = attendanceSummary[0] ?? { total: 0, present: 0, late: 0 };
  const attendancePct = Number(att.total) > 0
    ? Math.round((Number(att.present) + Number(att.late)) / Number(att.total) * 100)
    : null;

  res.json({
    success: true,
    data: {
      recentResults,
      upcomingClasses,
      recentMaterials,
      feeStatus: myFees[0] ?? null,
      pendingAssignments,
      openDoubtsCount: Number(openDoubts[0]?.total ?? 0),
      availableTestsCount: Number(availableTests[0]?.total ?? 0),
      attendancePct,
      attendanceSessions: Number(att.total),
      myBatchCount: batchIds.length,
    },
  });
}));

// ── Courses ────────────────────────────────────────────────────────────────
router.get('/courses', asyncHandler(async (req, res) => {
  const [profile] = await db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.userId, req.user!.id)).limit(1);
  let data;
  if (profile?.courseId) {
    data = await db.select().from(schema.courses).where(eq(schema.courses.id, profile.courseId));
  } else {
    data = await db.select().from(schema.courses).where(eq(schema.courses.status, 'active'));
  }
  res.json({ success: true, data });
}));

// ── Materials ──────────────────────────────────────────────────────────────
router.get('/materials', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.materials.id, title: schema.materials.title, description: schema.materials.description,
      fileUrl: schema.materials.fileUrl, fileType: schema.materials.fileType, fileName: schema.materials.fileName,
      fileSize: schema.materials.fileSize, createdAt: schema.materials.createdAt,
      courseName: schema.courses.name, uploaderName: schema.users.name,
    })
    .from(schema.materials)
    .leftJoin(schema.courses, eq(schema.materials.courseId, schema.courses.id))
    .leftJoin(schema.users, eq(schema.materials.uploadedBy, schema.users.id))
    .where(eq(schema.materials.visibility, true))
    .orderBy(desc(schema.materials.createdAt));
  res.json({ success: true, data });
}));

// ── Live Classes ───────────────────────────────────────────────────────────
router.get('/live-classes', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.liveClasses.id, title: schema.liveClasses.title, description: schema.liveClasses.description,
      scheduledDate: schema.liveClasses.scheduledDate, scheduledTime: schema.liveClasses.scheduledTime,
      duration: schema.liveClasses.duration, status: schema.liveClasses.status,
      meetingLink: schema.liveClasses.meetingLink, teacherName: schema.users.name, batchName: schema.batches.name,
    })
    .from(schema.liveClasses)
    .leftJoin(schema.users, eq(schema.liveClasses.teacherId, schema.users.id))
    .leftJoin(schema.batches, eq(schema.liveClasses.batchId, schema.batches.id))
    .orderBy(desc(schema.liveClasses.scheduledDate));
  res.json({ success: true, data });
}));

// ── Tests ──────────────────────────────────────────────────────────────────
router.get('/tests', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.tests.id, title: schema.tests.title, description: schema.tests.description,
      duration: schema.tests.duration, totalMarks: schema.tests.totalMarks, passingMarks: schema.tests.passingMarks,
      status: schema.tests.status, startDate: schema.tests.startDate, endDate: schema.tests.endDate,
      courseName: schema.courses.name,
    })
    .from(schema.tests)
    .leftJoin(schema.courses, eq(schema.tests.courseId, schema.courses.id))
    .where(eq(schema.tests.status, 'published'))
    .orderBy(desc(schema.tests.createdAt));
  res.json({ success: true, data });
}));

// ── Test Questions (for taking a test) ─────────────────────────────────────
router.get('/tests/:testId/questions', asyncHandler(async (req, res) => {
  const testId = String(req.params.testId);
  const questions = await db
    .select({
      id: schema.questions.id, questionText: schema.questions.questionText,
      questionType: schema.questions.questionType, marks: schema.questions.marks,
      options: schema.questions.options, order: schema.questions.order,
    })
    .from(schema.questions)
    .where(eq(schema.questions.testId, testId))
    .orderBy(schema.questions.order);
  res.json({ success: true, data: questions });
}));

// ── Submit Test ─────────────────────────────────────────────────────────────
router.post('/tests/:testId/submit', asyncHandler(async (req, res) => {
  const { answers } = req.body;
  const studentId = req.user!.id;
  const testId = String(req.params.testId);

  const existing = await db.select().from(schema.testResults)
    .where(and(eq(schema.testResults.testId, testId), eq(schema.testResults.studentId, studentId)))
    .limit(1);
  if (existing.length) throw new ApiError(400, 'Test already submitted');

  const [test] = await db.select().from(schema.tests).where(eq(schema.tests.id, testId)).limit(1);
  if (!test) throw new ApiError(404, 'Test not found');

  const questions = await db.select().from(schema.questions).where(eq(schema.questions.testId, testId));

  let marksObtained = 0;
  for (const q of questions) {
    if (q.questionType === 'mcq') {
      const submitted = (answers || []).find((a: any) => a.questionId === q.id);
      if (submitted && submitted.selectedAnswer === q.correctAnswer) {
        marksObtained += q.marks;
      }
    }
  }

  const percentage = test.totalMarks > 0 ? (marksObtained / test.totalMarks) * 100 : 0;

  await db.insert(schema.testResults).values({
    testId, studentId,
    marksObtained: marksObtained.toString(),
    percentage: percentage.toFixed(2),
    status: 'graded',
  });

  res.status(201).json({
    success: true,
    data: {
      marksObtained, totalMarks: test.totalMarks,
      percentage: parseFloat(percentage.toFixed(2)),
      passed: test.passingMarks ? marksObtained >= test.passingMarks : null,
    },
  });
}));

// ── Results ────────────────────────────────────────────────────────────────
router.get('/results', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.testResults.id, marksObtained: schema.testResults.marksObtained,
      percentage: schema.testResults.percentage, status: schema.testResults.status,
      remarks: schema.testResults.remarks, submittedAt: schema.testResults.submittedAt,
      testTitle: schema.tests.title, totalMarks: schema.tests.totalMarks, passingMarks: schema.tests.passingMarks,
      courseName: schema.courses.name,
    })
    .from(schema.testResults)
    .leftJoin(schema.tests, eq(schema.testResults.testId, schema.tests.id))
    .leftJoin(schema.courses, eq(schema.tests.courseId, schema.courses.id))
    .where(eq(schema.testResults.studentId, req.user!.id))
    .orderBy(desc(schema.testResults.submittedAt));
  res.json({ success: true, data });
}));

// ── Assignments ────────────────────────────────────────────────────────────
router.get('/assignments', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.assignments.id, title: schema.assignments.title, description: schema.assignments.description,
      dueDate: schema.assignments.dueDate, totalMarks: schema.assignments.totalMarks, createdAt: schema.assignments.createdAt,
      teacherName: schema.users.name, courseName: schema.courses.name,
      submissionId: schema.assignmentSubmissions.id,
      submissionStatus: schema.assignmentSubmissions.status,
      marksAwarded: schema.assignmentSubmissions.marksAwarded,
    })
    .from(schema.assignments)
    .leftJoin(schema.users, eq(schema.assignments.teacherId, schema.users.id))
    .leftJoin(schema.courses, eq(schema.assignments.courseId, schema.courses.id))
    .leftJoin(schema.assignmentSubmissions, and(
      eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id),
      eq(schema.assignmentSubmissions.studentId, req.user!.id)
    ))
    .orderBy(desc(schema.assignments.dueDate));
  res.json({ success: true, data });
}));

router.post('/assignments/:id/submit', asyncHandler(async (req, res) => {
  const assignmentId = String(req.params.id);
  const { submissionText, submissionUrl } = req.body;
  const existing = await db.select().from(schema.assignmentSubmissions)
    .where(and(eq(schema.assignmentSubmissions.assignmentId, assignmentId), eq(schema.assignmentSubmissions.studentId, req.user!.id)))
    .limit(1);
  if (existing.length) {
    await db.update(schema.assignmentSubmissions).set({ submissionText, submissionUrl }).where(eq(schema.assignmentSubmissions.id, existing[0].id));
  } else {
    await db.insert(schema.assignmentSubmissions).values({
      assignmentId, studentId: req.user!.id, submissionText, submissionUrl,
    });
  }
  res.json({ success: true, message: 'Assignment submitted' });
}));

// ── Doubts (N+1 fixed) ─────────────────────────────────────────────────────
router.get('/doubts', asyncHandler(async (req, res) => {
  const doubts = await db
    .select()
    .from(schema.doubts)
    .where(eq(schema.doubts.studentId, req.user!.id))
    .orderBy(desc(schema.doubts.createdAt));

  if (!doubts.length) return res.json({ success: true, data: [] });

  // Fix N+1: fetch all replies in one query, then group by doubtId
  const doubtIds = doubts.map(d => d.id);
  const allReplies = await db
    .select({
      id: schema.doubtReplies.id, doubtId: schema.doubtReplies.doubtId,
      reply: schema.doubtReplies.reply, createdAt: schema.doubtReplies.createdAt,
      teacherName: schema.users.name,
    })
    .from(schema.doubtReplies)
    .leftJoin(schema.users, eq(schema.doubtReplies.teacherId, schema.users.id))
    .where(inArray(schema.doubtReplies.doubtId, doubtIds));

  const repliesByDoubt = new Map<string, typeof allReplies>();
  for (const reply of allReplies) {
    const list = repliesByDoubt.get(reply.doubtId) ?? [];
    list.push(reply);
    repliesByDoubt.set(reply.doubtId, list);
  }

  const withReplies = doubts.map(d => ({ ...d, replies: repliesByDoubt.get(d.id) ?? [] }));
  res.json({ success: true, data: withReplies });
}));

router.post('/doubts', asyncHandler(async (req, res) => {
  const { question, subjectId } = req.body;
  if (!question) throw new ApiError(400, 'question is required');
  const [doubt] = await db.insert(schema.doubts).values({ studentId: req.user!.id, subjectId, question }).returning();
  res.status(201).json({ success: true, data: doubt });
}));

// ── Fees ───────────────────────────────────────────────────────────────────
router.get('/fees', asyncHandler(async (req, res) => {
  const [feesData, paymentsData] = await Promise.all([
    db.select({
      id: schema.fees.id, totalAmount: schema.fees.totalAmount, discount: schema.fees.discount,
      finalAmount: schema.fees.finalAmount, dueDate: schema.fees.dueDate, createdAt: schema.fees.createdAt,
      courseName: schema.courses.name,
    })
      .from(schema.fees)
      .leftJoin(schema.courses, eq(schema.fees.courseId, schema.courses.id))
      .where(eq(schema.fees.studentId, req.user!.id)),
    db.select()
      .from(schema.payments)
      .where(eq(schema.payments.studentId, req.user!.id))
      .orderBy(desc(schema.payments.paidAt)),
  ]);

  res.json({ success: true, data: { fees: feesData, payments: paymentsData } });
}));

// ── Profile ────────────────────────────────────────────────────────────────
router.get('/profile', asyncHandler(async (req, res) => {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, phone: schema.users.phone, profileImage: schema.users.profileImage, status: schema.users.status, createdAt: schema.users.createdAt })
    .from(schema.users).where(eq(schema.users.id, req.user!.id)).limit(1);
  const [profile] = await db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.userId, req.user!.id)).limit(1);
  res.json({ success: true, data: { ...user, profile } });
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const { phone, address, parentName, parentPhone } = req.body;
  await db.update(schema.users).set({ phone, updatedAt: new Date() }).where(eq(schema.users.id, req.user!.id));
  await db.update(schema.studentProfiles).set({ address, parentName, parentPhone }).where(eq(schema.studentProfiles.userId, req.user!.id));
  res.json({ success: true, message: 'Profile updated' });
}));

export default router;
