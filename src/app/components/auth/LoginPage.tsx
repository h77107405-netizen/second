import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { GraduationCap, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      setIsLoading(true);
      const user = await login(email, password);

      if (user?.role === 'admin') navigate('/admin', { replace: true });
      if (user?.role === 'teacher') navigate('/teacher', { replace: true });
      if (user?.role === 'student') navigate('/student', { replace: true });
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (quickEmail: string, quickPassword: string) => {
    setEmail(quickEmail);
    setPassword(quickPassword);
    try {
      setIsLoading(true);
      const user = await login(quickEmail, quickPassword);

      if (user?.role === 'admin') navigate('/admin', { replace: true });
      if (user?.role === 'teacher') navigate('/teacher', { replace: true });
      if (user?.role === 'student') navigate('/student', { replace: true });
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      await api.seed.demo();
      toast.success('Demo data seeded! You can now log in.');
    } catch (e: any) {
      toast.error(e.message || 'Seeding failed');
    } finally {
      setIsSeeding(false);
    }
  };

  const quickLoginButtons = [
    { label: 'Login as Student', email: 'student@demo.com', password: 'Student@123' },
    { label: 'Login as Teacher', email: 'teacher@demo.com', password: 'Teacher@123' },
    { label: 'Login as Admin', email: 'admin@demo.com', password: 'Admin@123' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Coaching Platform
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to access your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={isLoading}
            >
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Quick Demo Login</span>
            </div>
          </div>

          <div className="space-y-2">
            {quickLoginButtons.map((btn) => (
              <Button
                key={btn.email}
                variant="outline"
                className="w-full"
                onClick={() => { void handleQuickLogin(btn.email, btn.password); }}
                disabled={isLoading}
              >
                {btn.label}
              </Button>
            ))}
          </div>

          <div className="border-t pt-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleSeedDemo}
              disabled={isSeeding}
            >
              {isSeeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Seeding...</> : <><Database className="mr-2 h-4 w-4" />Seed Demo Data</>}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              First time? Seed demo data then use quick login buttons above.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
