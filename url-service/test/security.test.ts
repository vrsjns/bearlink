/**
 * Tests for Part 6: Security Hardening
 *  - Domain blocklist / allowlist filtering (checkDomain)
 *  - Google Safe Browsing API check at creation time
 *  - HMAC-signed URL: sign/verify service unit tests
 *  - requireSignature enforcement at redirect time
 *  - POST /urls/:id/sign endpoint
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaURL, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';
import { createApp } from '../app';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const makeUrl = (overrides = {}) => ({
  id: 1,
  shortId: 'abc1234567',
  customAlias: null,
  originalUrl: 'https://example.com',
  userId: 1,
  redirectType: 302,
  expiresAt: null,
  passwordHash: null,
  tags: [],
  utmParams: null,
  requireSignature: false,
  clicks: 0,
  previewTitle: null,
  previewDescription: null,
  previewImageUrl: null,
  previewFetchedAt: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };
const generateToken = (user = regularUser) =>
  jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });

// ─── Domain filter unit tests ─────────────────────────────────────────────────

describe('Domain filter (checkDomain)', () => {
  const { checkDomain } = require('../services/domainFilter.service');

  afterEach(() => {
    delete process.env.DOMAIN_BLOCKLIST;
    delete process.env.DOMAIN_ALLOWLIST;
  });

  it('allows all domains when no list is configured', () => {
    expect(checkDomain('https://example.com')).toEqual({ allowed: true });
    expect(checkDomain('https://evil.com/malware')).toEqual({ allowed: true });
  });

  it('blocks an exact domain on the blocklist', () => {
    process.env.DOMAIN_BLOCKLIST = 'evil.com,bad.org';
    const result = checkDomain('https://evil.com/path');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('blocks a subdomain when parent is on the blocklist', () => {
    process.env.DOMAIN_BLOCKLIST = 'evil.com';
    const result = checkDomain('https://sub.evil.com');
    expect(result.allowed).toBe(false);
  });

  it('allows a domain not on the blocklist', () => {
    process.env.DOMAIN_BLOCKLIST = 'evil.com';
    expect(checkDomain('https://safe.com')).toEqual({ allowed: true });
  });

  it('allows a domain on the allowlist', () => {
    process.env.DOMAIN_ALLOWLIST = 'example.com,safe.org';
    expect(checkDomain('https://example.com/foo')).toEqual({ allowed: true });
  });

  it('allows a subdomain when parent is on the allowlist', () => {
    process.env.DOMAIN_ALLOWLIST = 'example.com';
    expect(checkDomain('https://api.example.com')).toEqual({ allowed: true });
  });

  it('blocks a domain not on the allowlist', () => {
    process.env.DOMAIN_ALLOWLIST = 'example.com';
    const result = checkDomain('https://other.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('allowlist');
  });

  it('allowlist takes precedence: domain on allowlist is allowed even if also on blocklist', () => {
    process.env.DOMAIN_ALLOWLIST = 'example.com';
    process.env.DOMAIN_BLOCKLIST = 'example.com';
    // Allowlist is checked first and the domain is in it → allowed
    expect(checkDomain('https://example.com')).toEqual({ allowed: true });
  });

  it('returns not-allowed for an invalid URL', () => {
    const result = checkDomain('not-a-url');
    expect(result.allowed).toBe(false);
  });
});

// ─── Safe Browsing unit tests (injectable http client) ───────────────────────

describe('Safe Browsing (checkUrlSafety)', () => {
  const { checkUrlSafety } = require('../services/safeBrowsing.service');

  it('returns true (safe) when no API key is configured', async () => {
    const result = await checkUrlSafety('https://malware.com', undefined);
    expect(result).toBe(true);
  });

  it('returns false when API returns threat matches', async () => {
    const fakeHttp = { post: vi.fn().mockResolvedValue({ data: { matches: [{ threatType: 'MALWARE' }] } }) };
    const result = await checkUrlSafety('https://malware.com', 'fake-api-key', fakeHttp);
    expect(result).toBe(false);
  });

  it('returns true when API returns empty matches', async () => {
    const fakeHttp = { post: vi.fn().mockResolvedValue({ data: { matches: [] } }) };
    const result = await checkUrlSafety('https://example.com', 'fake-api-key', fakeHttp);
    expect(result).toBe(true);
  });

  it('returns true when API returns no matches field', async () => {
    const fakeHttp = { post: vi.fn().mockResolvedValue({ data: {} }) };
    const result = await checkUrlSafety('https://example.com', 'fake-api-key', fakeHttp);
    expect(result).toBe(true);
  });

  it('returns true (fail-open) when API call throws', async () => {
    const fakeHttp = { post: vi.fn().mockRejectedValue(new Error('timeout')) };
    const result = await checkUrlSafety('https://example.com', 'fake-api-key', fakeHttp);
    expect(result).toBe(true);
  });
});

// ─── Signed URL service unit tests ──────────────────────────────────────────

describe('Signed URL service', () => {
  const { signUrl, verifyUrl } = require('../services/signedUrl.service');
  const SECRET = 'test-secret-key';

  it('produces a URL with sig and exp query params', () => {
    const signed = signUrl('http://localhost:5001/abc123', SECRET);
    const url = new URL(signed);
    expect(url.searchParams.get('sig')).toBeTruthy();
    expect(url.searchParams.get('exp')).toBeTruthy();
  });

  it('verifies a freshly signed URL', () => {
    const base = 'http://localhost:5001/abc123';
    const signed = signUrl(base, SECRET, 3600);
    const url = new URL(signed);
    const result = verifyUrl(base, url.searchParams.get('sig')!, url.searchParams.get('exp')!, SECRET);
    expect(result.valid).toBe(true);
  });

  it('rejects an expired signature', () => {
    const base = 'http://localhost:5001/abc123';
    const signed = signUrl(base, SECRET, -1); // already expired
    const url = new URL(signed);
    const result = verifyUrl(base, url.searchParams.get('sig')!, url.searchParams.get('exp')!, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('rejects a tampered signature', () => {
    const base = 'http://localhost:5001/abc123';
    const signed = signUrl(base, SECRET, 3600);
    const url = new URL(signed);
    const result = verifyUrl(base, 'deadbeef'.repeat(8), url.searchParams.get('exp')!, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid signature/i);
  });

  it('rejects when sig or exp is missing', () => {
    const result = verifyUrl('http://localhost:5001/abc123', null as any, null as any, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });

  it('rejects when wrong secret is used', () => {
    const base = 'http://localhost:5001/abc123';
    const signed = signUrl(base, SECRET, 3600);
    const url = new URL(signed);
    const result = verifyUrl(base, url.searchParams.get('sig')!, url.searchParams.get('exp')!, 'wrong-secret');
    expect(result.valid).toBe(false);
  });
});

// ─── POST /urls — domain filter enforcement ──────────────────────────────────

describe('POST /urls — domain filter', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  afterEach(() => {
    delete process.env.DOMAIN_BLOCKLIST;
    delete process.env.DOMAIN_ALLOWLIST;
  });

  it('returns 422 when the domain is on the blocklist', async () => {
    process.env.DOMAIN_BLOCKLIST = 'blocked.com';
    const token = generateToken();

    const response = await request(app)
      .post('/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalUrl: 'https://blocked.com/page' })
      .expect(422);

    expect(response.body.error).toMatch(/blocked/i);
    expect(mockPrismaURL.create).not.toHaveBeenCalled();
  });

  it('returns 422 when the domain is not in the allowlist', async () => {
    process.env.DOMAIN_ALLOWLIST = 'allowed.com';
    const token = generateToken();

    const response = await request(app)
      .post('/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalUrl: 'https://other.com/page' })
      .expect(422);

    expect(response.body.error).toMatch(/allowlist/i);
    expect(mockPrismaURL.create).not.toHaveBeenCalled();
  });

  it('creates the URL when domain passes domain filter', async () => {
    process.env.DOMAIN_BLOCKLIST = 'evil.com';
    const token = generateToken();
    mockPrismaURL.create.mockResolvedValue(makeUrl());

    await request(app)
      .post('/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalUrl: 'https://example.com' })
      .expect(200);

    expect(mockPrismaURL.create).toHaveBeenCalledTimes(1);
  });
});

// ─── POST /urls — safe browsing enforcement ──────────────────────────────────

describe('POST /urls — safe browsing', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  it('creates URL when no SAFE_BROWSING_API_KEY is set (skip check)', async () => {
    delete process.env.SAFE_BROWSING_API_KEY;
    const token = generateToken();
    mockPrismaURL.create.mockResolvedValue(makeUrl());

    await request(app)
      .post('/urls')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalUrl: 'https://example.com' })
      .expect(200);

    expect(mockPrismaURL.create).toHaveBeenCalledTimes(1);
  });
});

// ─── GET /:shortId — requireSignature enforcement ────────────────────────────

describe('GET /:shortId — requireSignature', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';
  const SECRET = 'test-signing-secret';

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();
    process.env.URL_SIGNING_SECRET = SECRET;
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  afterEach(() => {
    delete process.env.URL_SIGNING_SECRET;
  });

  it('returns 403 when requireSignature=true and no sig/exp provided', async () => {
    const url = makeUrl({ requireSignature: true });
    mockPrismaURL.findFirst.mockResolvedValue(url);
    mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

    const response = await request(app)
      .get('/abc1234567')
      .set('User-Agent', 'Mozilla/5.0')
      .expect(403);

    expect(response.body.error).toMatch(/missing|signature/i);
  });

  it('returns 403 when requireSignature=true and signature is invalid', async () => {
    const url = makeUrl({ requireSignature: true });
    mockPrismaURL.findFirst.mockResolvedValue(url);

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const response = await request(app)
      .get('/abc1234567')
      .query({ sig: 'deadbeef'.repeat(8), exp: String(futureExp) })
      .set('User-Agent', 'Mozilla/5.0')
      .expect(403);

    expect(response.body.error).toMatch(/invalid|signature/i);
  });

  it('returns 403 when requireSignature=true and signature is expired', async () => {
    const { signUrl } = require('../services/signedUrl.service');
    const url = makeUrl({ requireSignature: true });
    mockPrismaURL.findFirst.mockResolvedValue(url);

    const signed = signUrl(`${baseUrl}/abc1234567`, SECRET, -1);
    const parsedUrl = new URL(signed);
    const sig = parsedUrl.searchParams.get('sig');
    const exp = parsedUrl.searchParams.get('exp');

    const response = await request(app)
      .get('/abc1234567')
      .query({ sig, exp })
      .set('User-Agent', 'Mozilla/5.0')
      .expect(403);

    expect(response.body.error).toMatch(/expired/i);
  });

  it('redirects when requireSignature=true and valid signature is provided', async () => {
    const { signUrl } = require('../services/signedUrl.service');
    const url = makeUrl({ requireSignature: true });
    mockPrismaURL.findFirst.mockResolvedValue(url);
    mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

    const signed = signUrl(`${baseUrl}/abc1234567`, SECRET, 3600);
    const parsedUrl = new URL(signed);
    const sig = parsedUrl.searchParams.get('sig');
    const exp = parsedUrl.searchParams.get('exp');

    const response = await request(app)
      .get('/abc1234567')
      .query({ sig, exp })
      .set('User-Agent', 'Mozilla/5.0')
      .expect(302);

    expect(response.headers.location).toBe('https://example.com');
  });

  it('redirects normally when requireSignature=false (no sig needed)', async () => {
    const url = makeUrl({ requireSignature: false });
    mockPrismaURL.findFirst.mockResolvedValue(url);
    mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

    const response = await request(app)
      .get('/abc1234567')
      .set('User-Agent', 'Mozilla/5.0')
      .expect(302);

    expect(response.headers.location).toBe('https://example.com');
  });
});

// ─── POST /urls/:id/sign endpoint ────────────────────────────────────────────

describe('POST /urls/:id/sign', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';
  const SECRET = 'test-signing-secret';

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();
    process.env.URL_SIGNING_SECRET = SECRET;
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  afterEach(() => {
    delete process.env.URL_SIGNING_SECRET;
  });

  it('returns a signedUrl for a valid URL owned by the user', async () => {
    const token = generateToken();
    mockPrismaURL.findFirst.mockResolvedValue(makeUrl());

    const response = await request(app)
      .post('/urls/1/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(response.body.signedUrl).toMatch(/sig=.+&exp=\d+|exp=\d+&sig=.+/);
  });

  it('returns 404 when the URL does not exist or belongs to another user', async () => {
    const token = generateToken();
    mockPrismaURL.findFirst.mockResolvedValue(null);

    await request(app)
      .post('/urls/99/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it('returns 503 when URL_SIGNING_SECRET is not configured', async () => {
    delete process.env.URL_SIGNING_SECRET;
    const token = generateToken();
    mockPrismaURL.findFirst.mockResolvedValue(makeUrl());

    await request(app)
      .post('/urls/1/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(503);
  });

  it('returns 401 without authentication', async () => {
    await request(app).post('/urls/1/sign').send({}).expect(401);
  });

  it('respects a custom ttl in the request body', async () => {
    const token = generateToken();
    mockPrismaURL.findFirst.mockResolvedValue(makeUrl());

    const response = await request(app)
      .post('/urls/1/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ ttl: 7200 })
      .expect(200);

    const url = new URL(response.body.signedUrl);
    const exp = Number(url.searchParams.get('exp'));
    const now = Math.floor(Date.now() / 1000);
    // exp should be roughly now + 7200
    expect(exp).toBeGreaterThan(now + 7100);
    expect(exp).toBeLessThan(now + 7300);
  });
});
