import createInstance from '@/lib/axios';

const urlApiClient = createInstance(process.env.NEXT_PUBLIC_URL_SERVICE_URL);

export interface CreateURLOptions {
  originalUrl: string;
  customAlias?: string;
  expiresAt?: string;
  password?: string;
  tags?: string[];
  redirectType?: number;
  utmParams?: Record<string, string>;
}

export interface UpdateURLOptions {
  originalUrl?: string;
  customAlias?: string;
  expiresAt?: string | null;
  password?: string;
  tags?: string[];
  redirectType?: number;
  utmParams?: Record<string, string> | null;
}

export interface GetURLsParams {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  expired?: boolean;
}

export const getURLs = async (params?: GetURLsParams) =>
  await urlApiClient.get(`/urls`, { params });
export const getURL = async (id: number) => await urlApiClient.get(`/${id}`);
export const createURL = async (options: CreateURLOptions) =>
  await urlApiClient.post('/urls', options);
export const updateURL = async (id: number, options: UpdateURLOptions) =>
  await urlApiClient.put(`/urls/${id}`, options);
export const deleteURL = async (id: number) => await urlApiClient.delete(`/urls/${id}`);
export const downloadQR = async (shortId: string): Promise<Blob> => {
  const response = await urlApiClient.get(`/${shortId}/qr`, { responseType: 'blob' });
  return response.data;
};
