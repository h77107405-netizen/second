import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../shared/Card';
import { Mail, Lock, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = (role: 'student' | 'teacher' | 'admin') => {
    const credentials = {
      student: { email: 'student@demo.com', password: 'Student@123' },
      teacher: { email: 'teacher@demo.com', password: 'Teacher@123' },
      admin: { email: 'admin@demo.com', password: 'Admin@123' },
    };
    
    setEmail(credentials[role].email);
    setPassword(credentials[role].password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Coaching Platform</h1>
          <p className="text-gray-600 mt-2">Sign in to continue</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                icon={<Mail className="h-4 w-4" />}
                required
              />
              
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                icon={<Lock className="h-4 w-4" />}
                required
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2 rounded" />
                  <span className="text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-blue-600 hover:text-blue-700">
                  Forgot password?
                </a>
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Sign In
              </Button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Quick Demo Login</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('student')}
                >
                  Student
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('teacher')}
                >
                  Teacher
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('admin')}
                >
                  Admin
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-600 mt-4">
          Don't have an account?{' '}
          <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
            Contact Admin
          </a>
        </p>
      </div>
    </div>
  );
};
