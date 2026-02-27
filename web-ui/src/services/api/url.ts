import createInstance from '@/lib/axios';

const urlApiClient = createInstance(process.env.NEXT_PUBLIC_URL_SERVICE_URL);

export const getURLs = async () => await urlApiClient.get(`/urls`);
export const getURL = async (id: number) => await urlApiClient.get(`/${id}`);
export const createURL = async (originalUrl: string) => await urlApiClient.post('/urls', { originalUrl });
export const updateURL = async (id: number, originalUrl: string) => await urlApiClient.put(`/urls/${id}`, { originalUrl });
export const deleteURL = async (id: number) => await urlApiClient.delete(`/urls/${id}`);
