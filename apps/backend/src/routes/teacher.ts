import { Router } from 'express';
import { eq, desc, count, and, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authenticate, requireTeacher } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { emitToUser, emitToUsers } from '../ws/wsManager.js';

const router = Router();
router.use(authenticate, requireTeacher);

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/dashboard', asyncHandler(async (req, res) => {
  const teacherId = req.user!.id;
  const [myBatches, materials, tests, pendingDoubts, upcomingClasses] = await Promise.all([
    db.select({ total: count() }).from(schema.batchTeachers).where(eq(schema.batchTeachers.teacherId, teacherId)),
    db.select({ total: count() }).from(schema.materials).where(eq(schema.materials.uploadedBy, teacherId)),
    db.select({ total: count() }).from(schema.tests).where(eq(schema.tests.teacherId, teacherId)),
    db.select({ total: count() }).from(schema.doubts).where(eq(schema.doubts.status, 'open')),
    db.select({
      id: schema.liveClasses.id, title: schema.liveClasses.title,
      scheduledDate: schema.liveClasses.scheduledDate, scheduledTime: schema.liveClasses.scheduledTime,
      meetingLink: schema.liveClasses.meetingLink, batchName: schema.batches.name,
    })
      .from(schema.liveClasses)
      .leftJoin(schema.batches, eq(schema.liveClasses.batchId, schema.batches.id))
      .where(and(eq(schema.liveClasses.teacherId, teacherId), eq(schema.liveClasses.status, 'scheduled')))
      .orderBy(schema.liveClasses.scheduledDate)
      .limit(5),
  ]);

  res.json({
    success: true,
    data: {
      myBatches: myBatches[0]?.total ?? 0,
      materialsUploaded: materials[0]?.total ?? 0,
      testsCreated: tests[0]?.total ?? 0,
      pendingDoubts: pendingDoubts[0]?.total ?? 0,
      upcomingClasses,
    },
  });
}));

// ── My Batches ─────────────────────────────────────────────────────────────
router.get('/batches', asyncHandler(async (req, res) => {
  const teacherId = req.user!.id;
  const rows = await db
    .select({
      id: schema.batches.id, name: schema.batches.name, timing: schema.batches.timing,
      status: schema.batches.status, description: schema.batches.description,
      courseId: schema.batches.courseId, courseName: schema.courses.name,
    })
    .from(schema.batchTeachers)
    .innerJoin(schema.batches, eq(schema.batchTeachers.batchId, schema.batches.id))
    .leftJoin(schema.courses, eq(schema.batches.courseId, schema.courses.id))
    .where(eq(schema.batchTeachers.teacherId, teacherId));

  res.json({ success: true, data: rows });
}));

// ── Materials ──────────────────────────────────────────────────────────────
router.get('/materials', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.materials.id, title: schema.materials.title, description: schema.materials.description,
      fileUrl: schema.materials.fileUrl, fileType: schema.materials.fileType, fileName: schema.materials.fileName,
      fileSize: schema.materials.fileSize, visibility: schema.materials.visibility, createdAt: schema.materials.createdAt,
      courseName: schema.courses.name,
    })
    .from(schema.materials)
    .leftJoin(schema.courses, eq(schema.materials.courseId, schema.courses.id))
    .where(eq(schema.materials.uploadedBy, req.user!.id))
    .orderBy(desc(schema.materials.createdAt));
  res.json({ success: true, data });
}));

router.post('/materials', asyncHandler(async (req, res) => {
  const { title, description, fileUrl, fileType, fileName, fileSize, courseId, batchId } = req.body;
  if (!title || !fileUrl || !fileName) throw new ApiError(400, 'title, fileUrl, fileName required');
  const [mat] = await db.insert(schema.materials).values({
    title, description, fileUrl, fileType: fileType || 'document', fileName,
    fileSize, courseId, batchId, visibility: true, uploadedBy: req.user!.id,
  }).returning();

  // Notify students in the batch about the new material
  if (batchId) {
    const batchStudents = await db
      .select({ studentId: schema.batchStudents.studentId })
      .from(schema.batchStudents)
      .where(eq(schema.batchStudents.batchId, batchId));

    if (batchStudents.length > 0) {
      const studentIds = batchStudents.map(s => s.studentId);
      const notifications = await db.insert(schema.notifications).values(
        studentIds.map(sid => ({
          receiverId: sid, senderId: req.user!.id, type: 'general',
          title: 'New Material Available',
          message: `"${title}" has been added to your course materials`,
        }))
      ).returning();
      const event = { id: notifications[0]?.id, title: 'New Material Available', message: `"${title}" has been added to your course materials`, type: 'general', createdAt: new Date().toISOString(), isRead: false };
      emitToUsers(studentIds, event);
    }
  }

  res.status(201).json({ success: true, data: mat });
}));

// ── Live Classes ───────────────────────────────────────────────────────────
router.get('/live-classes', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.liveClasses.id, title: schema.liveClasses.title, description: schema.liveClasses.description,
      scheduledDate: schema.liveClasses.scheduledDate, scheduledTime: schema.liveClasses.scheduledTime,
      duration: schema.liveClasses.duration, status: schema.liveClasses.status,
      meetingLink: schema.liveClasses.meetingLink, batchName: schema.batches.name,
    })
    .from(schema.liveClasses)
    .leftJoin(schema.batches, eq(schema.liveClasses.batchId, schema.batches.id))
    .where(eq(schema.liveClasses.teacherId, req.user!.id))
    .orderBy(desc(schema.liveClasses.scheduledDate));
  res.json({ success: true, data });
}));

router.post('/live-classes', asyncHandler(async (req, res) => {
  const { title, description, batchId, meetingLink, scheduledDate, scheduledTime, duration } = req.body;
  if (!title || !batchId || !meetingLink || !scheduledDate || !scheduledTime) {
    throw new ApiError(400, 'title, batchId, meetingLink, scheduledDate, scheduledTime required');
  }
  const [cls] = await db.insert(schema.liveClasses).values({
    title, description, teacherId: req.user!.id, batchId, meetingLink,
    scheduledDate: new Date(scheduledDate), scheduledTime, duration,
  }).returning();
  res.status(201).json({ success: true, data: cls });
}));

router.put('/live-classes/:id', asyncHandler(async (req, res) => {
  const { title, description, meetingLink, scheduledDate, scheduledTime, duration, status } = req.body;
  const classId = String(req.params.id);
  const [prev] = await db.select({ status: schema.liveClasses.status, batchId: schema.liveClasses.batchId, title: schema.liveClasses.title })
    .from(schema.liveClasses)
    .where(and(eq(schema.liveClasses.id, classId), eq(schema.liveClasses.teacherId, req.user!.id))).limit(1);

  await db.update(schema.liveClasses).set({
    title, description, meetingLink,
    scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
    scheduledTime, duration, status, updatedAt: new Date(),
  }).where(and(eq(schema.liveClasses.id, classId), eq(schema.liveClasses.teacherId, req.user!.id)));

  // SSE: notify batch students when class goes live
  if (status === 'live' && prev?.status !== 'live' && prev?.batchId) {
    const batchStudents = await db
      .select({ studentId: schema.batchStudents.studentId })
      .from(schema.batchStudents)
      .where(eq(schema.batchStudents.batchId, prev.batchId));

    if (batchStudents.length > 0) {
      const studentIds = batchStudents.map(s => s.studentId);
      const classTitle = title || prev.title;
      const notifications = await db.insert(schema.notifications).values(
        studentIds.map(sid => ({
          receiverId: sid, senderId: req.user!.id, type: 'class',
          title: '🔴 Class is Live Now!',
          message: `"${classTitle}" has started. Join now!`,
        }))
      ).returning();
      const event = { id: notifications[0]?.id, title: '🔴 Class is Live Now!', message: `"${classTitle}" has started. Join now!`, type: 'class', createdAt: new Date().toISOString(), isRead: false };
      emitToUsers(studentIds, event);
    }
  }

  res.json({ success: true, message: 'Class updated' });
}));

router.delete('/live-classes/:id', asyncHandler(async (req, res) => {
  const classId = String(req.params.id);
  await db.delete(schema.liveClasses).where(and(eq(schema.liveClasses.id, classId), eq(schema.liveClasses.teacherId, req.user!.id)));
  res.json({ success: true, message: 'Class deleted' });
}));

// ── Tests ──────────────────────────────────────────────────────────────────
router.get('/tests', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.tests.id, title: schema.tests.title, description: schema.tests.description,
      duration: schema.tests.duration, totalMarks: schema.tests.totalMarks, passingMarks: schema.tests.passingMarks,
      status: schema.tests.status, startDate: schema.tests.startDate, endDate: schema.tests.endDate,
      createdAt: schema.tests.createdAt, batchName: schema.batches.name, courseName: schema.courses.name,
    })
    .from(schema.tests)
    .leftJoin(schema.batches, eq(schema.tests.batchId, schema.batches.id))
    .leftJoin(schema.courses, eq(schema.tests.courseId, schema.courses.id))
    .where(eq(schema.tests.teacherId, req.user!.id))
    .orderBy(desc(schema.tests.createdAt));
  res.json({ success: true, data });
}));

router.post('/tests', asyncHandler(async (req, res) => {
  const { title, description, batchId, courseId, duration, totalMarks, passingMarks, startDate, endDate, questions: qs } = req.body;
  if (!title || !duration || !totalMarks) throw new ApiError(400, 'title, duration, totalMarks required');
  const [test] = await db.insert(schema.tests).values({
    title, description, batchId, courseId, teacherId: req.user!.id,
    duration: parseInt(duration), totalMarks: parseInt(totalMarks),
    passingMarks: passingMarks ? parseInt(passingMarks) : null,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
  }).returning();
  if (qs?.length) {
    await db.insert(schema.questions).values(qs.map((q: any, i: number) => ({
      testId: test.id, questionText: q.questionText, questionType: q.questionType || 'mcq',
      marks: parseInt(q.marks || '1'), options: q.options, correctAnswer: q.correctAnswer, order: i,
    })));
  }
  res.status(201).json({ success: true, data: test });
}));

router.put('/tests/:id', asyncHandler(async (req, res) => {
  const { title, description, status, startDate, endDate } = req.body;
  const testId = String(req.params.id);

  // Fetch current test to detect publish transition
  const [currentTest] = await db.select().from(schema.tests)
    .where(and(eq(schema.tests.id, testId), eq(schema.tests.teacherId, req.user!.id))).limit(1);
  if (!currentTest) throw new ApiError(404, 'Test not found');

  await db.update(schema.tests).set({ title, description, status, startDate, endDate, updatedAt: new Date() })
    .where(eq(schema.tests.id, testId));

  // If publishing for the first time, notify all students in the batch
  if (status === 'published' && currentTest.status !== 'published' && currentTest.batchId) {
    const students = await db.select({ id: schema.users.id })
      .from(schema.batchStudents)
      .innerJoin(schema.users, eq(schema.batchStudents.studentId, schema.users.id))
      .where(eq(schema.batchStudents.batchId, currentTest.batchId));

    if (students.length > 0) {
      const studentIds = students.map(s => s.id);
      const testTitle = title ?? currentTest.title;
      const notifValues = studentIds.map(id => ({
        receiverId: id, senderId: req.user!.id,
        type: 'test_published',
        title: '📝 New Test Available',
        message: `"${testTitle}" is now available. Good luck!`,
        link: '/student/tests',
      }));
      await db.insert(schema.notifications).values(notifValues);
      const wsEvent = { type: 'test_published', title: '📝 New Test Available', message: `"${testTitle}" is now available. Good luck!`, link: '/student/tests', createdAt: new Date().toISOString(), isRead: false };
      emitToUsers(studentIds, wsEvent);
    }
  }

  res.json({ success: true, message: 'Test updated' });
}));

// ── Assignments ────────────────────────────────────────────────────────────
router.get('/assignments', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.assignments.id, title: schema.assignments.title, description: schema.assignments.description,
      dueDate: schema.assignments.dueDate, totalMarks: schema.assignments.totalMarks, createdAt: schema.assignments.createdAt,
      batchName: schema.batches.name, courseName: schema.courses.name,
    })
    .from(schema.assignments)
    .leftJoin(schema.batches, eq(schema.assignments.batchId, schema.batches.id))
    .leftJoin(schema.courses, eq(schema.assignments.courseId, schema.courses.id))
    .where(eq(schema.assignments.teacherId, req.user!.id))
    .orderBy(desc(schema.assignments.createdAt));
  res.json({ success: true, data });
}));

router.post('/assignments', asyncHandler(async (req, res) => {
  const { title, description, batchId, courseId, dueDate, totalMarks } = req.body;
  if (!title || !description || !dueDate) throw new ApiError(400, 'title, description, dueDate required');
  const [asgn] = await db.insert(schema.assignments).values({
    title, description, batchId, courseId, teacherId: req.user!.id,
    dueDate: new Date(dueDate), totalMarks,
  }).returning();
  res.status(201).json({ success: true, data: asgn });
}));

// ── Assignment Submissions / Grading ───────────────────────────────────────
router.get('/assignments/:id/submissions', asyncHandler(async (req, res) => {
  const assignmentId = String(req.params.id);
  const [assignment] = await db.select().from(schema.assignments)
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.teacherId, req.user!.id))).limit(1);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  const data = await db
    .select({
      id: schema.assignmentSubmissions.id,
      studentId: schema.assignmentSubmissions.studentId,
      studentName: schema.users.name,
      studentEmail: schema.users.email,
      submissionText: schema.assignmentSubmissions.submissionText,
      submissionUrl: schema.assignmentSubmissions.submissionUrl,
      submittedAt: schema.assignmentSubmissions.submittedAt,
      status: schema.assignmentSubmissions.status,
      marksAwarded: schema.assignmentSubmissions.marksAwarded,
      feedback: schema.assignmentSubmissions.feedback,
      gradedAt: schema.assignmentSubmissions.gradedAt,
    })
    .from(schema.assignmentSubmissions)
    .leftJoin(schema.users, eq(schema.assignmentSubmissions.studentId, schema.users.id))
    .where(eq(schema.assignmentSubmissions.assignmentId, assignmentId))
    .orderBy(desc(schema.assignmentSubmissions.submittedAt));

  res.json({ success: true, data, assignment });
}));

router.patch('/assignments/:id/submissions/:submissionId/grade', asyncHandler(async (req, res) => {
  const { marksAwarded, feedback } = req.body;
  const assignmentId = String(req.params.id);
  const submissionId = String(req.params.submissionId);
  if (marksAwarded === undefined) throw new ApiError(400, 'marksAwarded is required');

  const [assignment] = await db.select().from(schema.assignments)
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.teacherId, req.user!.id))).limit(1);
  if (!assignment) throw new ApiError(403, 'Not your assignment');

  const [submission] = await db.select({ studentId: schema.assignmentSubmissions.studentId })
    .from(schema.assignmentSubmissions).where(eq(schema.assignmentSubmissions.id, submissionId)).limit(1);

  await db.update(schema.assignmentSubmissions).set({
    marksAwarded: parseInt(marksAwarded), feedback, status: 'graded',
    gradedAt: new Date(), gradedBy: req.user!.id,
  }).where(eq(schema.assignmentSubmissions.id, submissionId));

  // Notify student of graded assignment
  if (submission?.studentId) {
    const [notif] = await db.insert(schema.notifications).values({
      receiverId: submission.studentId, senderId: req.user!.id, type: 'assignment',
      title: 'Assignment Graded',
      message: `Your assignment "${assignment.title}" has been graded. You received ${marksAwarded} marks.${feedback ? ` Feedback: ${feedback}` : ''}`,
    }).returning();
    emitToUser(submission.studentId, { id: notif.id, title: notif.title, message: notif.message, type: 'assignment', createdAt: new Date().toISOString(), isRead: false });
  }

  res.json({ success: true, message: 'Submission graded' });
}));

// ── Doubts ─────────────────────────────────────────────────────────────────
router.get('/doubts', asyncHandler(async (req, res) => {
  const data = await db
    .select({
      id: schema.doubts.id, question: schema.doubts.question, status: schema.doubts.status,
      imageUrl: schema.doubts.imageUrl, createdAt: schema.doubts.createdAt,
      studentName: schema.users.name, subjectId: schema.doubts.subjectId,
    })
    .from(schema.doubts)
    .leftJoin(schema.users, eq(schema.doubts.studentId, schema.users.id))
    .orderBy(desc(schema.doubts.createdAt));
  res.json({ success: true, data });
}));

router.post('/doubts/:id/reply', asyncHandler(async (req, res) => {
  const { reply } = req.body;
  const doubtId = String(req.params.id);
  if (!reply) throw new ApiError(400, 'reply is required');

  // Fetch the doubt to get the student's id and question preview
  const [doubt] = await db
    .select({ studentId: schema.doubts.studentId, question: schema.doubts.question })
    .from(schema.doubts)
    .where(eq(schema.doubts.id, doubtId));

  if (!doubt) throw new ApiError(404, 'Doubt not found');

  await db.insert(schema.doubtReplies).values({ doubtId, teacherId: req.user!.id, reply });
  await db.update(schema.doubts).set({ status: 'answered', updatedAt: new Date() }).where(eq(schema.doubts.id, doubtId));

  // Persist a notification record so the student sees it in the bell
  const questionPreview = doubt.question.length > 60 ? doubt.question.slice(0, 60) + '…' : doubt.question;
  const [notif] = await db.insert(schema.notifications).values({
    receiverId: doubt.studentId,
    senderId: req.user!.id,
    type: 'doubt',
    title: 'Your doubt has been answered',
    message: `A teacher replied to: "${questionPreview}"`,
  }).returning();

  // Push real-time WebSocket event to the student
  emitToUser(doubt.studentId, {
    id: notif.id,
    title: notif.title,
    message: notif.message,
    type: 'doubt',
    doubtId,
    createdAt: notif.createdAt,
    isRead: false,
  });

  res.json({ success: true, message: 'Reply posted' });
}));

// ── Test Questions ─────────────────────────────────────────────────────────
router.get('/tests/:id/questions', asyncHandler(async (req, res) => {
  const testId = String(req.params.id);
  const data = await db.select().from(schema.questions).where(eq(schema.questions.testId, testId)).orderBy(schema.questions.order);
  res.json({ success: true, data });
}));

router.post('/tests/:id/questions', asyncHandler(async (req, res) => {
  const { questions: qs } = req.body;
  const testId = String(req.params.id);
  if (!qs?.length) throw new ApiError(400, 'questions array is required');
  await db.delete(schema.questions).where(eq(schema.questions.testId, testId));
  const inserted = await db.insert(schema.questions).values(
    qs.map((q: any, i: number) => ({
      testId,
      questionText: q.questionText,
      questionType: q.questionType || 'mcq',
      marks: parseInt(q.marks || '1'),
      options: q.options,
      correctAnswer: q.correctAnswer,
      order: i,
    }))
  ).returning();
  res.json({ success: true, data: inserted });
}));

// ── Analytics (N+1 fixed) ──────────────────────────────────────────────────
router.get('/analytics', asyncHandler(async (req, res) => {
  const teacherId = req.user!.id;

  const [batchRows, [{ total: totalMaterials }], testRows, [{ total: totalDoubts }], [{ total: totalLiveClasses }], [{ total: pendingDoubts }]] = await Promise.all([
    db.select({ id: schema.batches.id, name: schema.batches.name })
      .from(schema.batchTeachers)
      .innerJoin(schema.batches, eq(schema.batchTeachers.batchId, schema.batches.id))
      .where(eq(schema.batchTeachers.teacherId, teacherId)),
    db.select({ total: count() }).from(schema.materials).where(eq(schema.materials.uploadedBy, teacherId)),
    db.select({ id: schema.tests.id, title: schema.tests.title, totalMarks: schema.tests.totalMarks, status: schema.tests.status, createdAt: schema.tests.createdAt })
      .from(schema.tests).where(eq(schema.tests.teacherId, teacherId)).orderBy(desc(schema.tests.createdAt)),
    db.select({ total: count() }).from(schema.doubts),
    db.select({ total: count() }).from(schema.liveClasses).where(eq(schema.liveClasses.teacherId, teacherId)),
    db.select({ total: count() }).from(schema.doubts).where(eq(schema.doubts.status, 'open')),
  ]);

  // Fix N+1: get all batch student counts in a single query using SQL aggregation
  const batchIds = batchRows.map(b => b.id);
  let batchesWithStudents = batchRows.map(b => ({ ...b, studentCount: 0 }));

  if (batchIds.length > 0) {
    const batchCounts = await db
      .select({
        batchId: schema.batchStudents.batchId,
        studentCount: count(),
      })
      .from(schema.batchStudents)
      .where(inArray(schema.batchStudents.batchId, batchIds))
      .groupBy(schema.batchStudents.batchId);

    const countMap = new Map(batchCounts.map(r => [r.batchId, r.studentCount]));
    batchesWithStudents = batchRows.map(b => ({ ...b, studentCount: countMap.get(b.id) ?? 0 }));
  }

  const totalStudents = batchesWithStudents.reduce((s, b) => s + b.studentCount, 0);

  // Fix N+1: get all test result summaries in a single query using SQL aggregation
  const recentTests = testRows.slice(0, 6);
  const testResultSummary: { testTitle: string; attempts: number; avgScore: number }[] = [];

  if (recentTests.length > 0) {
    const testIds = recentTests.map(t => t.id);
    const resultAggregates = await db
      .select({
        testId: schema.testResults.testId,
        attempts: count(),
        avgScore: sql<number>`ROUND(AVG(${schema.testResults.percentage}), 1)`,
      })
      .from(schema.testResults)
      .where(inArray(schema.testResults.testId, testIds))
      .groupBy(schema.testResults.testId);

    const resultMap = new Map(resultAggregates.map(r => [r.testId, r]));
    for (const t of recentTests) {
      const agg = resultMap.get(t.id);
      testResultSummary.push({
        testTitle: t.title,
        attempts: agg?.attempts ?? 0,
        avgScore: agg?.avgScore ?? 0,
      });
    }
  }

  const resolvedDoubts = totalDoubts - pendingDoubts;

  res.json({
    success: true,
    data: {
      totalStudents, totalBatches: batchRows.length, totalTests: testRows.length,
      totalMaterials, totalLiveClasses, totalDoubts, pendingDoubts, resolvedDoubts,
      batches: batchesWithStudents, testResultSummary,
    },
  });
}));

// ── Student Progress (per batch) ───────────────────────────────────────────
router.get('/batches/:batchId/students/progress', asyncHandler(async (req, res) => {
  const batchId = String(req.params.batchId);

  // Verify teacher belongs to this batch
  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'You are not a teacher of this batch');

  // Fetch all data in parallel with SQL aggregation (no N+1)
  const [students, batchTests, batchAssignments] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, enrolledAt: schema.batchStudents.enrolledAt })
      .from(schema.batchStudents)
      .innerJoin(schema.users, eq(schema.batchStudents.studentId, schema.users.id))
      .where(eq(schema.batchStudents.batchId, batchId))
      .orderBy(schema.users.name),
    db.select({ id: schema.tests.id }).from(schema.tests).where(eq(schema.tests.batchId, batchId)),
    db.select({ id: schema.assignments.id }).from(schema.assignments).where(eq(schema.assignments.batchId, batchId)),
  ]);

  if (students.length === 0) return res.json({ success: true, data: [], totalTests: 0, totalAssignments: 0 });

  const studentIds = students.map(s => s.id);
  const testIds = batchTests.map(t => t.id);
  const assignmentIds = batchAssignments.map(a => a.id);

  const [testAggRows, assignmentAggRows, doubtAggRows] = await Promise.all([
    testIds.length > 0
      ? db.select({
          studentId: schema.testResults.studentId,
          attempted: count(),
          avgPct: sql<number>`ROUND(AVG(${schema.testResults.percentage}), 1)`,
          bestPct: sql<number>`ROUND(MAX(${schema.testResults.percentage}), 1)`,
        })
        .from(schema.testResults)
        .where(and(inArray(schema.testResults.testId, testIds), inArray(schema.testResults.studentId, studentIds)))
        .groupBy(schema.testResults.studentId)
      : Promise.resolve([]),
    assignmentIds.length > 0
      ? db.select({
          studentId: schema.assignmentSubmissions.studentId,
          submitted: count(),
          graded: sql<number>`SUM(CASE WHEN ${schema.assignmentSubmissions.status} = 'graded' THEN 1 ELSE 0 END)`,
          avgMarks: sql<number>`ROUND(AVG(CASE WHEN ${schema.assignmentSubmissions.marksAwarded} IS NOT NULL THEN ${schema.assignmentSubmissions.marksAwarded} END), 1)`,
        })
        .from(schema.assignmentSubmissions)
        .where(and(inArray(schema.assignmentSubmissions.assignmentId, assignmentIds), inArray(schema.assignmentSubmissions.studentId, studentIds)))
        .groupBy(schema.assignmentSubmissions.studentId)
      : Promise.resolve([]),
    db.select({
        studentId: schema.doubts.studentId,
        total: count(),
        open: sql<number>`SUM(CASE WHEN ${schema.doubts.status} = 'open' THEN 1 ELSE 0 END)`,
        answered: sql<number>`SUM(CASE WHEN ${schema.doubts.status} IN ('answered', 'resolved') THEN 1 ELSE 0 END)`,
      })
      .from(schema.doubts)
      .where(inArray(schema.doubts.studentId, studentIds))
      .groupBy(schema.doubts.studentId),
  ]);

  const testMap = new Map(testAggRows.map(r => [r.studentId, r]));
  const asgMap = new Map(assignmentAggRows.map(r => [r.studentId, r]));
  const doubtMap = new Map(doubtAggRows.map(r => [r.studentId, r]));

  const data = students.map(s => {
    const t = testMap.get(s.id);
    const a = asgMap.get(s.id);
    const d = doubtMap.get(s.id);
    const avgPct = Number(t?.avgPct ?? 0);
    const grade = avgPct >= 90 ? 'A+' : avgPct >= 80 ? 'A' : avgPct >= 70 ? 'B' : avgPct >= 60 ? 'C' : avgPct > 0 ? 'D' : '—';
    return {
      studentId: s.id, name: s.name, email: s.email, enrolledAt: s.enrolledAt,
      testsAttempted: Number(t?.attempted ?? 0),
      avgTestScore: avgPct,
      bestTestScore: Number(t?.bestPct ?? 0),
      assignmentsSubmitted: Number(a?.submitted ?? 0),
      assignmentsGraded: Number(a?.graded ?? 0),
      avgAssignmentMarks: Number(a?.avgMarks ?? 0),
      totalDoubts: Number(d?.total ?? 0),
      openDoubts: Number(d?.open ?? 0),
      answeredDoubts: Number(d?.answered ?? 0),
      grade,
    };
  });

  res.json({ success: true, data, totalTests: testIds.length, totalAssignments: assignmentIds.length });
}));

// ── Test Results ───────────────────────────────────────────────────────────
router.get('/tests/:testId/results', asyncHandler(async (req, res) => {
  const testId = String(req.params.testId);
  const data = await db
    .select({
      id: schema.testResults.id, marksObtained: schema.testResults.marksObtained,
      percentage: schema.testResults.percentage, status: schema.testResults.status,
      submittedAt: schema.testResults.submittedAt, studentName: schema.users.name,
    })
    .from(schema.testResults)
    .leftJoin(schema.users, eq(schema.testResults.studentId, schema.users.id))
    .where(eq(schema.testResults.testId, testId))
    .orderBy(desc(schema.testResults.submittedAt));
  res.json({ success: true, data });
}));

// ── Attendance ──────────────────────────────────────────────────────────────
// Create a new attendance session
router.post('/attendance/sessions', asyncHandler(async (req, res) => {
  const { batchId, title, sessionDate, topic } = req.body;
  if (!batchId || !title || !sessionDate) throw new ApiError(400, 'batchId, title, and sessionDate are required');

  // Verify teacher is in batch
  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'You are not a teacher of this batch');

  // Get all students in batch
  const students = await db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.batchStudents)
    .innerJoin(schema.users, eq(schema.batchStudents.studentId, schema.users.id))
    .where(eq(schema.batchStudents.batchId, batchId))
    .orderBy(schema.users.name);

  const [session] = await db.insert(schema.attendanceSessions).values({
    batchId, teacherId: req.user!.id, title, sessionDate: new Date(sessionDate), topic,
  }).returning();

  // Pre-populate records with 'present' for all students
  if (students.length > 0) {
    await db.insert(schema.attendanceRecords).values(
      students.map(s => ({ sessionId: session.id, studentId: s.id, status: 'present' as const }))
    );
  }

  res.json({ success: true, data: { session, students } });
}));

// List sessions for a batch
router.get('/attendance/sessions', asyncHandler(async (req, res) => {
  const { batchId } = req.query as { batchId: string };
  if (!batchId) throw new ApiError(400, 'batchId is required');

  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'You are not a teacher of this batch');

  const sessions = await db.select({
    id: schema.attendanceSessions.id,
    title: schema.attendanceSessions.title,
    sessionDate: schema.attendanceSessions.sessionDate,
    topic: schema.attendanceSessions.topic,
    createdAt: schema.attendanceSessions.createdAt,
    totalRecords: count(schema.attendanceRecords.id),
    presentCount: sql<number>`SUM(CASE WHEN ${schema.attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)`,
    absentCount: sql<number>`SUM(CASE WHEN ${schema.attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)`,
    lateCount: sql<number>`SUM(CASE WHEN ${schema.attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)`,
  })
    .from(schema.attendanceSessions)
    .leftJoin(schema.attendanceRecords, eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId))
    .where(eq(schema.attendanceSessions.batchId, batchId))
    .groupBy(schema.attendanceSessions.id)
    .orderBy(desc(schema.attendanceSessions.sessionDate));

  res.json({ success: true, data: sessions });
}));

// Get single session with all records
router.get('/attendance/sessions/:sessionId', asyncHandler(async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const [session] = await db.select().from(schema.attendanceSessions).where(eq(schema.attendanceSessions.id, sessionId)).limit(1);
  if (!session) throw new ApiError(404, 'Session not found');

  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, session.batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'Not authorized');

  const records = await db.select({
    id: schema.attendanceRecords.id,
    studentId: schema.attendanceRecords.studentId,
    studentName: schema.users.name,
    status: schema.attendanceRecords.status,
    note: schema.attendanceRecords.note,
  })
    .from(schema.attendanceRecords)
    .innerJoin(schema.users, eq(schema.attendanceRecords.studentId, schema.users.id))
    .where(eq(schema.attendanceRecords.sessionId, sessionId))
    .orderBy(schema.users.name);

  res.json({ success: true, data: { session, records } });
}));

// Update attendance records for a session
router.put('/attendance/sessions/:sessionId', asyncHandler(async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const { records } = req.body as { records: { studentId: string; status: 'present' | 'absent' | 'late'; note?: string }[] };
  if (!records || !Array.isArray(records)) throw new ApiError(400, 'records array is required');

  const [session] = await db.select().from(schema.attendanceSessions).where(eq(schema.attendanceSessions.id, sessionId)).limit(1);
  if (!session) throw new ApiError(404, 'Session not found');

  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, session.batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'Not authorized');

  // Upsert each record
  for (const r of records) {
    await db.update(schema.attendanceRecords)
      .set({ status: r.status, note: r.note ?? null })
      .where(and(eq(schema.attendanceRecords.sessionId, sessionId), eq(schema.attendanceRecords.studentId, r.studentId)));
  }

  res.json({ success: true, message: 'Attendance saved' });
}));

// Delete a session
router.delete('/attendance/sessions/:sessionId', asyncHandler(async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const [session] = await db.select().from(schema.attendanceSessions).where(eq(schema.attendanceSessions.id, sessionId)).limit(1);
  if (!session) throw new ApiError(404, 'Session not found');

  const [membership] = await db.select().from(schema.batchTeachers)
    .where(and(eq(schema.batchTeachers.batchId, session.batchId), eq(schema.batchTeachers.teacherId, req.user!.id))).limit(1);
  if (!membership) throw new ApiError(403, 'Not authorized');

  await db.delete(schema.attendanceSessions).where(eq(schema.attendanceSessions.id, sessionId));
  res.json({ success: true, message: 'Session deleted' });
}));

export default router;
