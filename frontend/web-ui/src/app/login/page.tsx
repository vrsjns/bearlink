'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { login, isAuthenticated } from '@/services/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Login = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/');
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/');
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Login failed';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">BearLink Login</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-4">
        <a href="/forgot-password" className="text-primary underline">
          Forgot Password?
        </a>
      </p>
      <div className="mt-4">
        <Button variant="ghost" onClick={() => router.push('/register')}>
          Register
        </Button>
      </div>
    </div>
  );
};

export default Login;
