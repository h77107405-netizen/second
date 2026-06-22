const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

async function uploadFile(file: File): Promise<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string }> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.data;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

function buildQuery(params?: PaginationParams & Record<string, any>): string {
  if (!params) return '';
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const str = q.toString();
  return str ? `?${str}` : '';
}

export const api = {
  // File Upload
  uploadFile,

  // Auth
  auth: {
    login: (email: string, password: string) =>
      request<{ success: boolean; token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ success: boolean; data: any }>('/auth/me'),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
    updateProfile: (data: { name?: string; phone?: string }) =>
      request<any>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Notifications
  notifications: {
    getAll: () => request<any>('/notifications'),
    getUnreadCount: () => request<any>('/notifications/unread-count'),
    markRead: (id: string) => request<any>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request<any>('/notifications/read-all', { method: 'PATCH' }),
    send: (data: any) => request<any>('/notifications/send', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Admin
  admin: {
    dashboard: () => request<any>('/admin/dashboard'),

    // Students (server-side paginated)
    getStudents: (params?: PaginationParams) => request<any>(`/admin/students${buildQuery(params)}`),
    getAllStudents: () => request<any>('/admin/students/all'),
    createStudent: (data: any) => request<any>('/admin/students', { method: 'POST', body: JSON.stringify(data) }),
    updateStudent: (id: string, data: any) => request<any>(`/admin/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStudent: (id: string) => request<any>(`/admin/students/${id}`, { method: 'DELETE' }),

    // Teachers (server-side paginated)
    getTeachers: (params?: PaginationParams) => request<any>(`/admin/teachers${buildQuery(params)}`),
    getAllTeachers: () => request<any>('/admin/teachers/all'),
    createTeacher: (data: any) => request<any>('/admin/teachers', { method: 'POST', body: JSON.stringify(data) }),
    updateTeacher: (id: string, data: any) => request<any>(`/admin/teachers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTeacher: (id: string) => request<any>(`/admin/teachers/${id}`, { method: 'DELETE' }),

    // Courses (server-side paginated)
    getCourses: (params?: PaginationParams & { all?: boolean }) => request<any>(`/admin/courses${buildQuery(params)}`),
    createCourse: (data: any) => request<any>('/admin/courses', { method: 'POST', body: JSON.stringify(data) }),
    updateCourse: (id: string, data: any) => request<any>(`/admin/courses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCourse: (id: string) => request<any>(`/admin/courses/${id}`, { method: 'DELETE' }),

    // Subjects
    getSubjects: (courseId: string) => request<any>(`/admin/courses/${courseId}/subjects`),
    createSubject: (courseId: string, data: any) => request<any>(`/admin/courses/${courseId}/subjects`, { method: 'POST', body: JSON.stringify(data) }),
    updateSubject: (courseId: string, subId: string, data: any) => request<any>(`/admin/courses/${courseId}/subjects/${subId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteSubject: (courseId: string, subId: string) => request<any>(`/admin/courses/${courseId}/subjects/${subId}`, { method: 'DELETE' }),

    // Chapters
    getChapters: (subjectId: string) => request<any>(`/admin/subjects/${subjectId}/chapters`),
    createChapter: (subjectId: string, data: any) => request<any>(`/admin/subjects/${subjectId}/chapters`, { method: 'POST', body: JSON.stringify(data) }),
    updateChapter: (subjectId: string, chapterId: string, data: any) => request<any>(`/admin/subjects/${subjectId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteChapter: (subjectId: string, chapterId: string) => request<any>(`/admin/subjects/${subjectId}/chapters/${chapterId}`, { method: 'DELETE' }),

    // Batches (server-side paginated)
    getBatches: (params?: PaginationParams & { all?: boolean }) => request<any>(`/admin/batches${buildQuery(params)}`),
    createBatch: (data: any) => request<any>('/admin/batches', { method: 'POST', body: JSON.stringify(data) }),
    updateBatch: (id: string, data: any) => request<any>(`/admin/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteBatch: (id: string) => request<any>(`/admin/batches/${id}`, { method: 'DELETE' }),
    getBatchMembers: (id: string) => request<any>(`/admin/batches/${id}/members`),
    addBatchTeacher: (id: string, teacherId: string) => request<any>(`/admin/batches/${id}/teachers`, { method: 'POST', body: JSON.stringify({ teacherId }) }),
    removeBatchTeacher: (id: string, teacherId: string) => request<any>(`/admin/batches/${id}/teachers/${teacherId}`, { method: 'DELETE' }),
    addBatchStudent: (id: string, studentId: string) => request<any>(`/admin/batches/${id}/students`, { method: 'POST', body: JSON.stringify({ studentId }) }),
    removeBatchStudent: (id: string, studentId: string) => request<any>(`/admin/batches/${id}/students/${studentId}`, { method: 'DELETE' }),

    // Materials (server-side paginated)
    getMaterials: (params?: PaginationParams) => request<any>(`/admin/materials${buildQuery(params)}`),
    createMaterial: (data: any) => request<any>('/admin/materials', { method: 'POST', body: JSON.stringify(data) }),
    deleteMaterial: (id: string) => request<any>(`/admin/materials/${id}`, { method: 'DELETE' }),

    // Live Classes (server-side paginated)
    getLiveClasses: (params?: PaginationParams) => request<any>(`/admin/live-classes${buildQuery(params)}`),

    // Tests (server-side paginated)
    getTests: (params?: PaginationParams) => request<any>(`/admin/tests${buildQuery(params)}`),
    getTestResults: (testId: string) => request<any>(`/admin/tests/${testId}/results`),

    // Fees (server-side paginated)
    getFees: (params?: PaginationParams) => request<any>(`/admin/fees${buildQuery(params)}`),
    createFee: (data: any) => request<any>('/admin/fees', { method: 'POST', body: JSON.stringify(data) }),
    recordPayment: (feeId: string, data: any) => request<any>(`/admin/fees/${feeId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
    getFeeReceipt: (feeId: string) => request<any>(`/admin/fees/${feeId}/receipt`),

    // Settings
    getSettings: () => request<any>('/admin/settings'),
    saveSettings: (data: Record<string, string>) => request<any>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

    // Notifications broadcast
    broadcastNotification: (data: any) => request<any>('/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify(data) }),

    // Audit Logs (server-side paginated)
    getAuditLogs: (params?: PaginationParams & { entity?: string; action?: string; from?: string; to?: string; all?: string }) => request<any>(`/admin/audit-logs${buildQuery(params)}`),
  },

  // Teacher
  teacher: {
    dashboard: () => request<any>('/teacher/dashboard'),
    analytics: () => request<any>('/teacher/analytics'),
    getBatches: () => request<any>('/teacher/batches'),
    getMaterials: () => request<any>('/teacher/materials'),
    uploadMaterial: (data: any) => request<any>('/teacher/materials', { method: 'POST', body: JSON.stringify(data) }),
    getLiveClasses: () => request<any>('/teacher/live-classes'),
    createLiveClass: (data: any) => request<any>('/teacher/live-classes', { method: 'POST', body: JSON.stringify(data) }),
    updateLiveClass: (id: string, data: any) => request<any>(`/teacher/live-classes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteLiveClass: (id: string) => request<any>(`/teacher/live-classes/${id}`, { method: 'DELETE' }),
    getTests: () => request<any>('/teacher/tests'),
    createTest: (data: any) => request<any>('/teacher/tests', { method: 'POST', body: JSON.stringify(data) }),
    updateTest: (id: string, data: any) => request<any>(`/teacher/tests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getTestQuestions: (testId: string) => request<any>(`/teacher/tests/${testId}/questions`),
    saveTestQuestions: (testId: string, questions: any[]) => request<any>(`/teacher/tests/${testId}/questions`, { method: 'POST', body: JSON.stringify({ questions }) }),
    getTestResults: (testId: string) => request<any>(`/teacher/tests/${testId}/results`),
    getAssignments: () => request<any>('/teacher/assignments'),
    createAssignment: (data: any) => request<any>('/teacher/assignments', { method: 'POST', body: JSON.stringify(data) }),
    getAssignmentSubmissions: (assignmentId: string) => request<any>(`/teacher/assignments/${assignmentId}/submissions`),
    gradeSubmission: (assignmentId: string, submissionId: string, data: any) =>
      request<any>(`/teacher/assignments/${assignmentId}/submissions/${submissionId}/grade`, { method: 'PATCH', body: JSON.stringify(data) }),
    getDoubts: () => request<any>('/teacher/doubts'),
    replyDoubt: (doubtId: string, reply: string) => request<any>(`/teacher/doubts/${doubtId}/reply`, { method: 'POST', body: JSON.stringify({ reply }) }),
    getProfile: () => request<any>('/auth/me'),
    updateProfile: (data: { name?: string; phone?: string }) => request<any>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Student
  student: {
    dashboard: () => request<any>('/student/dashboard'),
    getCourses: () => request<any>('/student/courses'),
    getMaterials: () => request<any>('/student/materials'),
    getLiveClasses: () => request<any>('/student/live-classes'),
    getTests: () => request<any>('/student/tests'),
    getTestQuestions: (testId: string) => request<any>(`/student/tests/${testId}/questions`),
    submitTest: (testId: string, answers: any[]) => request<any>(`/student/tests/${testId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
    getResults: () => request<any>('/student/results'),
    getAssignments: () => request<any>('/student/assignments'),
    submitAssignment: (id: string, data: any) => request<any>(`/student/assignments/${id}/submit`, { method: 'POST', body: JSON.stringify(data) }),
    getDoubts: () => request<any>('/student/doubts'),
    postDoubt: (data: any) => request<any>('/student/doubts', { method: 'POST', body: JSON.stringify(data) }),
    getFees: () => request<any>('/student/fees'),
    getProfile: () => request<any>('/student/profile'),
    updateProfile: (data: any) => request<any>('/student/profile', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Seed
  seed: {
    demo: () => request<any>('/seed/demo', { method: 'POST' }),
  },
};
