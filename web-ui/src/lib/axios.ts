import axios from 'axios';

const createInstance = (API_URL: string | undefined) => {
    const instance = axios.create({
        baseURL: API_URL,
        withCredentials: true,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    instance.interceptors.response.use(
        (response) => {
            return response;
        },
        (error) => {
            if (error.response && error.response.status === 401) {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            }
            return Promise.reject(error);
        }
    );

    return instance;
};

export default createInstance;
