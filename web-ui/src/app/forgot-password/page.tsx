'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { forgotPassword } from '@/services/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ForgotPassword = () => {
  const [email, setEmail] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await forgotPassword(email);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Error requesting password reset:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">Forgot Password</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
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
            <Button type="submit" className="w-full">
              Request Password Reset
            </Button>
          </form>
        </CardContent>
      </Card>
      {message && <p className="mt-4 text-green-600">{message}</p>}
      <div className="mt-4">
        <Button variant="ghost" onClick={() => router.push('/login')}>
          Login
        </Button>
      </div>
    </div>
  );
};

export default ForgotPassword;
