'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { resetPassword } from '@/services/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ResetPassword = () => {
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const { token } = useParams();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await resetPassword(String(token), password);
      router.push('/login');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Password reset failed. The link may be invalid or expired.';
      setError(message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">Reset Password</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">New Password</Label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full">
              Reset Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
