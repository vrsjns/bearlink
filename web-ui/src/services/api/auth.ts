import createInstance from '@/lib/axios';

const authApiClient = createInstance(process.env.NEXT_PUBLIC_AUTH_SERVICE_URL);

export const login = async (email: string, password: string) => {
    try {
        const response = await authApiClient.post('/login', { email, password });
        localStorage.setItem('token', response.data.token);
    } catch (error) {
        console.error(error);
        throw new Error('Invalid credentials');
    }
};

export const register = async (email: string, password: string, name: string) => {
    try {
        const response = await authApiClient.post('/register', { email, password, name });
        localStorage.setItem('token', response.data.token);
    } catch (error) {
        console.error(error);
        throw new Error('Registration failed');
    }
};

export const logout = () => {
    localStorage.removeItem('token');
};

export const isAuthenticated = () => {
    return !!localStorage.getItem('token');
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

export const fetchUserProfile = async () => {
    if (!isAuthenticated()) {
        throw new Error('Not authenticated');
    }

    try {
        return {
            email: 'user@example.com',  // Placeholder for actual email value
            name: 'John Doe' // Placeholder for actual name value
        };
        const response = await authApiClient.get('/profile');
        return response.data;
    } catch (error) {
        console.error(error);
        throw new Error('Failed to fetch profile');
    }
};