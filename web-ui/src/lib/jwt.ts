export interface JwtPayload {
    id: number;
    email: string;
    name: string;
    role: string;
    iat: number;
    exp: number;
}

export const parseJwt = (token: string): JwtPayload | null => {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            return null;
        }
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
};

export const getCurrentUser = (): JwtPayload | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    const raw = localStorage.getItem('user');
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as JwtPayload;
    } catch {
        return null;
    }
};
