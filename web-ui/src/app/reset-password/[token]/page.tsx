'use client';

import { useState, FormEvent } from 'react';
import axios from '../../../lib/axios';
import { useRouter, useParams } from 'next/navigation';
import { resetPassword } from '@/services/api/auth';

const ResetPassword = () => {
  const [password, setPassword] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const { token } = useParams();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!(token instanceof String))
        throw new Error('Invalid token type! Token must be a string!');

      const response = await resetPassword(String(token), password);
      setMessage(response.data.message);

      router.push('/login');
    } catch (error) {
      console.error('Error resetting password:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">Reset Password</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-card p-8 rounded shadow">
        <div className="mb-4">
          <label htmlFor="password" className="block text-foreground text-sm font-bold mb-2">
            New Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>
        <button
          type="submit"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Reset Password
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
    </div>
  );
};

export default ResetPassword;
