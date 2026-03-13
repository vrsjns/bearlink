import createInstance from '@/lib/axios';

const analyticsApiClient = createInstance(process.env.NEXT_PUBLIC_ANALYTICS_SERVICE_URL);
