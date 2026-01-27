'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { forgotPassword } from '@/services/api/auth';

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
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <h1 className="text-5xl font-bold mb-8 text-blue-600">Forgot Password</h1>
            <form onSubmit={handleSubmit} className="w-full max-w-md bg-white p-8 rounded shadow">
                <div className="mb-4">
                    <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    />
                </div>
                <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                    Request Password Reset
                </button>
            </form>
            {message && <p className="mt-4 text-green-600">{message}</p>}
            <div className="mt-8">
                <button
                    onClick={() => router.push('/login')}
                    className="ml-4 bg-white hover:text-blue-600 text-black py-2 px-4 rounded rounded-lg border border-gray-200 focus:outline-shadow focus:shadow-outline"
                >
                    Login
                </button>
            </div>
        </div>
    );
};

export default ForgotPassword;
