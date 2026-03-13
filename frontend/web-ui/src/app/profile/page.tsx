'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchUserProfile,
  updateUserProfile,
  changePassword,
  UserProfile,
} from '../../services/api/auth';
import { getCurrentUser } from '../../lib/jwt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Profile edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
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
      setProfileMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update profile',
      });
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
      setPasswordMessage({
        type: 'error',
        text: 'Password must contain uppercase, lowercase, and a number',
      });
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
      setPasswordMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to change password',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const emailChanged = editEmail !== profile?.email;

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="profile">
            <TabsList className="mb-6 w-full">
              <TabsTrigger value="profile" className="flex-1">
                Profile
              </TabsTrigger>
              <TabsTrigger value="password" className="flex-1">
                Password
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile">
              {profile && (
                <div>
                  {profileMessage && (
                    <Alert
                      variant={profileMessage.type === 'error' ? 'destructive' : 'default'}
                      className="mb-4"
                    >
                      <AlertDescription>{profileMessage.text}</AlertDescription>
                    </Alert>
                  )}

                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      </div>
                      {emailChanged && (
                        <div className="space-y-1">
                          <Label>
                            Current Password <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Required to change email"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label>Role</Label>
                        <p className="px-3 py-2 bg-muted rounded-md text-muted-foreground">
                          {profile.role}
                        </p>
                      </div>
                      <div className="flex gap-3 mt-6">
                        <Button
                          onClick={handleProfileSave}
                          disabled={profileLoading}
                          className="flex-1"
                        >
                          {profileLoading ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleEditToggle}
                          disabled={profileLoading}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Name</Label>
                        <p className="text-lg">{profile.name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        <p className="text-lg">{profile.email}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Role</Label>
                        <p className="text-lg capitalize">{profile.role}</p>
                      </div>
                      <Button onClick={handleEditToggle} className="mt-4">
                        Edit Profile
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Password Tab */}
            <TabsContent value="password">
              <div>
                {passwordMessage && (
                  <Alert
                    variant={passwordMessage.type === 'error' ? 'destructive' : 'default'}
                    className="mb-4"
                  >
                    <AlertDescription>{passwordMessage.text}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      At least 8 characters with uppercase, lowercase, and number
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handlePasswordChange}
                    disabled={passwordLoading}
                    className="w-full mt-4"
                  >
                    {passwordLoading ? 'Changing...' : 'Change Password'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
