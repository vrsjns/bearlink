'use client';

import { useEffect, useState } from 'react';
import { fetchUserProfile } from '../../services/api/auth';

export default function ProfilePage() {
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        const loadProfile = async () => {
            const data = await fetchUserProfile();
            setProfile(data);
        };
        loadProfile();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-gray-100">
            <div className="max-w-md bg-white p-8 rounded-md shadow-md">
                <h1 className="text-2xl font-bold mb-4">Profile</h1>
                {profile && (
                    <div>
                        <p className="text-lg">Email: {profile}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
