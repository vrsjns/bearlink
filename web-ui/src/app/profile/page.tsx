'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchUserProfile, updateUserProfile, changePassword, UserProfile } from '../../services/api/auth';
import { getCurrentUser } from '../../lib/jwt';

type Tab = 'profile' | 'password';

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const router = useRouter();

    // Profile edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem('user')) {
            router.push('/login');
            return;
        }

        const loadProfile = async () => {
            try {
                const data = await fetchUserProfile();
                setProfile(data);
                setEditName(data.name);
                setEditEmail(data.email);
            } catch (error) {
                console.error('Error fetching profile:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadProfile();
    }, [router]);

    const handleEditToggle = () => {
        if (isEditing) {
            // Cancel - reset to original values
            setEditName(profile?.name || '');
            setEditEmail(profile?.email || '');
            setEditPassword('');
            setProfileMessage(null);
        }
        setIsEditing(!isEditing);
    };

    const handleProfileSave = async () => {
        if (!profile) return;

        const currentUser = getCurrentUser();
        if (!currentUser) {
            router.push('/login');
            return;
        }

        // Validate input
        if (!editName.trim()) {
            setProfileMessage({ type: 'error', text: 'Name is required' });
            return;
        }

        const emailChanged = editEmail !== profile.email;
        if (emailChanged && !editPassword) {
            setProfileMessage({ type: 'error', text: 'Password required to change email' });
            return;
        }

        setProfileLoading(true);
        setProfileMessage(null);

        try {
            const updateData: { name?: string; email?: string; currentPassword?: string } = {};

            if (editName.trim() !== profile.name) {
                updateData.name = editName.trim();
            }

            if (emailChanged) {
                updateData.email = editEmail;
                updateData.currentPassword = editPassword;
            }

            if (Object.keys(updateData).length === 0) {
                setIsEditing(false);
                return;
            }

            const updatedProfile = await updateUserProfile(currentUser.id, updateData);
            setProfile(updatedProfile);
            setEditName(updatedProfile.name);
            setEditEmail(updatedProfile.email);
            setEditPassword('');
            setIsEditing(false);
            setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
        } catch (error) {
            setProfileMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update profile' });
        } finally {
            setProfileLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            router.push('/login');
            return;
        }

        // Client-side validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'All fields are required' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        if (newPassword.length < 8) {
            setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
            return;
        }

        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            setPasswordMessage({ type: 'error', text: 'Password must contain uppercase, lowercase, and a number' });
            return;
        }

        setPasswordLoading(true);
        setPasswordMessage(null);

        try {
            await changePassword(currentUser.id, { currentPassword, newPassword });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordMessage({ type: 'success', text: 'Password changed successfully' });
        } catch (error) {
            setPasswordMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to change password' });
        } finally {
            setPasswordLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    const emailChanged = editEmail !== profile?.email;

    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-gray-100">
            <div className="w-full max-w-md bg-white p-8 rounded-md shadow-md">
                <h1 className="text-2xl font-bold mb-6">Profile</h1>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        className={`py-2 px-4 font-medium ${activeTab === 'profile'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                        onClick={() => setActiveTab('profile')}
                    >
                        Profile
                    </button>
                    <button
                        className={`py-2 px-4 font-medium ${activeTab === 'password'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                        onClick={() => setActiveTab('password')}
                    >
                        Password
                    </button>
                </div>

                {/* Profile Tab */}
                {activeTab === 'profile' && profile && (
                    <div>
                        {profileMessage && (
                            <div className={`mb-4 p-3 rounded ${profileMessage.type === 'success'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                                }`}>
                                {profileMessage.text}
                            </div>
                        )}

                        {isEditing ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editEmail}
                                        onChange={(e) => setEditEmail(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                {emailChanged && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Current Password <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={editPassword}
                                            onChange={(e) => setEditPassword(e.target.value)}
                                            placeholder="Required to change email"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                    <p className="px-3 py-2 bg-gray-100 rounded-md text-gray-600">{profile.role}</p>
                                </div>
                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={handleProfileSave}
                                        disabled={profileLoading}
                                        className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
                                    >
                                        {profileLoading ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                        onClick={handleEditToggle}
                                        disabled={profileLoading}
                                        className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Name</label>
                                    <p className="text-lg">{profile.name}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Email</label>
                                    <p className="text-lg">{profile.email}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Role</label>
                                    <p className="text-lg capitalize">{profile.role}</p>
                                </div>
                                <button
                                    onClick={handleEditToggle}
                                    className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
                                >
                                    Edit Profile
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Password Tab */}
                {activeTab === 'password' && (
                    <div>
                        {passwordMessage && (
                            <div className={`mb-4 p-3 rounded ${passwordMessage.type === 'success'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                                }`}>
                                {passwordMessage.text}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    At least 8 characters with uppercase, lowercase, and number
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button
                                onClick={handlePasswordChange}
                                disabled={passwordLoading}
                                className="w-full mt-4 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
                            >
                                {passwordLoading ? 'Changing...' : 'Change Password'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
