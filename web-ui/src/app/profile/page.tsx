'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchUserProfile } from '../../services/api/auth';

interface UserProfile {
    email: string;
    name: string;
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        const loadProfile = async () => {
            try {
                const data = await fetchUserProfile();
                setProfile(data);
            } catch (error) {
                console.error('Error fetching profile:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadProfile();
    }, [router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-gray-100">
            <div className="max-w-md bg-white p-8 rounded-md shadow-md">
                <h1 className="text-2xl font-bold mb-4">Profile</h1>
                {profile && (
                    <div>
                        <p className="text-lg">Name: {profile.name}</p>
                        <p className="text-lg">Email: {profile.email}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
