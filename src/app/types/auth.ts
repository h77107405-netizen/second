export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  profileImage?: string;
  status: 'active' | 'blocked' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface StudentProfile extends User {
  role: 'student';
  studentId: string;
  batchId?: string;
  courseId?: string;
  parentPhone?: string;
  address?: string;
  dateOfBirth?: string;
  enrolledDate: string;
}

export interface TeacherProfile extends User {
  role: 'teacher';
  teacherId: string;
  subjects: string[];
  batches: string[];
  experience?: number;
  qualification?: string;
  bio?: string;
}

export interface AdminProfile extends User {
  role: 'admin';
  adminId: string;
  permissions: string[];
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User | undefined>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
}
