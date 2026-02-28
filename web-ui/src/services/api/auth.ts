import createInstance from '@/lib/axios';

const authApiClient = createInstance(process.env.NEXT_PUBLIC_AUTH_SERVICE_URL);

export const login = async (email: string, password: string) => {
    try {
        const response = await authApiClient.post('/login', { email, password });
        localStorage.setItem('user', JSON.stringify(response.data.user));
    } catch (error) {
        console.error(error);
        throw new Error('Invalid credentials');
    }
};

export const register = async (email: string, password: string, name: string) => {
    try {
        const response = await authApiClient.post('/register', { email, password, name });
        localStorage.setItem('user', JSON.stringify(response.data.user));
    } catch (error) {
        console.error(error);
        throw new Error('Registration failed');
    }
};

export const logout = async () => {
    try {
        await authApiClient.post('/logout');
    } catch {
        // best-effort: clear local state even if server call fails
    } finally {
        localStorage.removeItem('user');
    }
};

export const isAuthenticated = () => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('user');
};

export const forgotPassword = async (email: string) => {
    try {
        const response = await authApiClient.post('/forgot-password', { email });
        return response;
    } catch (error) {
        console.error(error);
        throw new Error('Password reset link sent failed');
    }
};

export const resetPassword = async (token: string, password: string) => {
    try {
        const response = await authApiClient.post(`/reset-password/${token}`, { password });
        return response;
    } catch (error) {
        console.error(error);
        throw new Error('Reset password failed');
    }
};

export interface UserProfile {
    id: number;
    email: string;
    name: string;
    role: string;
    createdAt: string;
}

export interface UpdateProfileData {
    name?: string;
    email?: string;
    currentPassword?: string;
}

export interface ChangePasswordData {
    currentPassword: string;
    newPassword: string;
}

export const fetchUserProfile = async (): Promise<UserProfile> => {
    try {
        const response = await authApiClient.get('/profile');
        return response.data;
    } catch (error) {
        console.error(error);
        throw new Error('Failed to fetch profile');
    }
};

export const updateUserProfile = async (userId: number, data: UpdateProfileData): Promise<UserProfile> => {
    try {
        const response = await authApiClient.put(`/users/${userId}`, data);
        return response.data.user;
    } catch (error: unknown) {
        console.error(error);
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { data?: { error?: string }, status?: number } };
            if (axiosError.response?.data?.error) {
                throw new Error(axiosError.response.data.error);
            }
            if (axiosError.response?.status === 403) {
                throw new Error('Invalid password or insufficient permissions');
            }
            if (axiosError.response?.status === 409) {
                throw new Error('Email already in use');
            }
        }
        throw new Error('Failed to update profile');
    }
};

export const changePassword = async (userId: number, data: ChangePasswordData): Promise<void> => {
    try {
        await authApiClient.post(`/users/${userId}/password`, data);
    } catch (error: unknown) {
        console.error(error);
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { data?: { error?: string }, status?: number } };
            if (axiosError.response?.data?.error) {
                throw new Error(axiosError.response.data.error);
            }
            if (axiosError.response?.status === 403) {
                throw new Error('Invalid current password');
            }
        }
        throw new Error('Failed to change password');
    }
};
