import { http, HttpResponse } from 'msw';

const AUTH_SERVICE_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:4000';
const URL_SERVICE_URL = process.env.NEXT_PUBLIC_URL_SERVICE_URL || 'http://localhost:5000';

export const handlers = [
  // Auth Service Handlers
  http.post(`${AUTH_SERVICE_URL}/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    if (body.email === 'test@example.com' && body.password === 'Password123') {
      return HttpResponse.json({
        token: 'mock-jwt-token',
      });
    }

    return HttpResponse.json({ error: 'Invalid email or password.' }, { status: 400 });
  }),

  http.post(`${AUTH_SERVICE_URL}/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string; name: string };

    if (body.email === 'existing@example.com') {
      return HttpResponse.json({ error: 'Email already in use.' }, { status: 409 });
    }

    return HttpResponse.json({
      token: 'mock-jwt-token',
    });
  }),

  http.get(`${AUTH_SERVICE_URL}/profile`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    return HttpResponse.json({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      createdAt: new Date().toISOString(),
    });
  }),

  http.put(`${AUTH_SERVICE_URL}/users/:userId`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as { name?: string; email?: string };

    return HttpResponse.json({
      user: {
        id: 1,
        email: body.email || 'test@example.com',
        name: body.name || 'Test User',
        role: 'USER',
        createdAt: new Date().toISOString(),
      },
      token: 'updated-mock-jwt-token',
    });
  }),

  http.post(`${AUTH_SERVICE_URL}/users/:userId/password`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as { currentPassword: string; newPassword: string };

    if (body.currentPassword !== 'CurrentPassword123') {
      return HttpResponse.json({ error: 'Invalid current password.' }, { status: 403 });
    }

    return HttpResponse.json({ message: 'Password changed successfully.' });
  }),

  // URL Service Handlers
  http.get(`${URL_SERVICE_URL}/urls`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    return HttpResponse.json([
      {
        id: 1,
        originalUrl: 'https://example.com',
        shortId: 'abc123',
        clicks: 10,
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        originalUrl: 'https://google.com',
        shortId: 'def456',
        clicks: 5,
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.post(`${URL_SERVICE_URL}/urls`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as { originalUrl: string };

    return HttpResponse.json({
      shortUrl: `http://localhost:5000/new123`,
      id: 3,
      originalUrl: body.originalUrl,
      shortId: 'new123',
      clicks: 0,
      createdAt: new Date().toISOString(),
    });
  }),

  http.put(`${URL_SERVICE_URL}/urls/:id`, async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as { originalUrl: string };

    return HttpResponse.json({
      id: Number(params.id),
      originalUrl: body.originalUrl,
      shortId: 'abc123',
      clicks: 10,
      createdAt: new Date().toISOString(),
    });
  }),

  http.delete(`${URL_SERVICE_URL}/urls/:id`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
