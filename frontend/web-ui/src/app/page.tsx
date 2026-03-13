'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createURL, CreateURLOptions } from '@/services/api/url';
import { fetchUserProfile } from '@/services/api/auth';
import { getCurrentUser } from '@/lib/jwt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

const Home = () => {
  const [originalUrl, setOriginalUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [aliasError, setAliasError] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  const [expiryError, setExpiryError] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [tags, setTags] = useState('');
  const [redirectType, setRedirectType] = useState<302 | 301>(302);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.exp && user.exp * 1000 < Date.now()) {
      localStorage.removeItem('user');
      router.push('/login');
      return;
    }
    fetchUserProfile()
      .then(() => setIsLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  const validateAlias = (value: string) => {
    if (!value) return '';
    if (!/^[a-zA-Z0-9-]+$/.test(value)) return 'Only alphanumeric characters and hyphens allowed.';
    if (value.length < 3 || value.length > 50) return 'Alias must be 3–50 characters.';
    return '';
  };

  const handleAliasChange = (value: string) => {
    setCustomAlias(value);
    setAliasError(validateAlias(value));
  };

  const validateExpiry = (date: string, time: string) => {
    if (!date) return '';
    const combined = new Date(`${date}T${time || '00:00'}`);
    if (isNaN(combined.getTime())) return '';
    return combined <= new Date() ? 'Expiry date must be in the future.' : '';
  };

  const handleExpiryDateChange = (value: string) => {
    setExpiryDate(value);
    setExpiryError(validateExpiry(value, expiryTime));
  };

  const handleExpiryTimeChange = (value: string) => {
    setExpiryTime(value);
    setExpiryError(validateExpiry(expiryDate, value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const aliasErr = validateAlias(customAlias);
    if (aliasErr) {
      setAliasError(aliasErr);
      return;
    }

    const expiryErr = validateExpiry(expiryDate, expiryTime);
    if (expiryErr) {
      setExpiryError(expiryErr);
      return;
    }

    const utmParams: Record<string, string> = {};
    if (utmSource) utmParams.utm_source = utmSource;
    if (utmMedium) utmParams.utm_medium = utmMedium;
    if (utmCampaign) utmParams.utm_campaign = utmCampaign;
    if (utmTerm) utmParams.utm_term = utmTerm;
    if (utmContent) utmParams.utm_content = utmContent;

    const options: CreateURLOptions = {
      originalUrl,
      ...(customAlias && { customAlias }),
      ...(expiryDate && {
        expiresAt: new Date(`${expiryDate}T${expiryTime || '00:00'}`).toISOString(),
      }),
      ...(passwordEnabled && password && { password }),
      ...(tags && {
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
      redirectType,
      ...(Object.keys(utmParams).length > 0 && { utmParams }),
    };

    setIsSubmitting(true);
    try {
      const response = await createURL(options);
      setShortUrl(response.data.shortUrl);
      setCopied(false);
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { message?: string } } };
      if (err.response?.status === 409) {
        setAliasError('This alias is already taken.');
      } else {
        const message = err.response?.data?.message ?? 'Failed to shorten URL';
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">BearLink</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Shorten your URLs with ease and track their performance!
      </p>
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="originalUrl">Original URL</Label>
              <Input
                type="url"
                id="originalUrl"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="Enter your URL"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customAlias">Custom alias (optional)</Label>
              <Input
                type="text"
                id="customAlias"
                value={customAlias}
                onChange={(e) => handleAliasChange(e.target.value)}
                placeholder="my-link"
              />
              {aliasError && <p className="text-sm text-destructive">{aliasError}</p>}
            </div>

            <div className="space-y-1">
              <Label>Expiry (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  id="expiryDate"
                  value={expiryDate}
                  onChange={(e) => handleExpiryDateChange(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="time"
                  id="expiryTime"
                  value={expiryTime}
                  onChange={(e) => handleExpiryTimeChange(e.target.value)}
                  disabled={!expiryDate}
                  className="w-32"
                />
              </div>
              {expiryError && <p className="text-sm text-destructive">{expiryError}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="passwordEnabled"
                checked={passwordEnabled}
                onChange={(e) => setPasswordEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="passwordEnabled">Password protect</Label>
            </div>
            {passwordEnabled && (
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="tags">Tags (optional, comma-separated)</Label>
              <Input
                type="text"
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="marketing, product"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="redirectType">Redirect type</Label>
              <select
                id="redirectType"
                value={redirectType}
                onChange={(e) => setRedirectType(Number(e.target.value) as 302 | 301)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value={302}>302 Temporary</option>
                <option value={301}>301 Permanent</option>
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                {showAdvanced ? 'Hide' : 'Show'} advanced options
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-3 border rounded-md p-3">
                <p className="text-sm font-medium">UTM parameters</p>
                {[
                  { id: 'utmSource', label: 'utm_source', value: utmSource, setter: setUtmSource },
                  { id: 'utmMedium', label: 'utm_medium', value: utmMedium, setter: setUtmMedium },
                  {
                    id: 'utmCampaign',
                    label: 'utm_campaign',
                    value: utmCampaign,
                    setter: setUtmCampaign,
                  },
                  { id: 'utmTerm', label: 'utm_term', value: utmTerm, setter: setUtmTerm },
                  {
                    id: 'utmContent',
                    label: 'utm_content',
                    value: utmContent,
                    setter: setUtmContent,
                  },
                ].map(({ id, label, value, setter }) => (
                  <div key={id} className="space-y-1">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      type="text"
                      id={id}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={label}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Shortening...' : 'Shorten'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {shortUrl && (
        <div className="mt-8 flex items-center gap-3">
          <p className="text-lg">
            Short URL:{' '}
            <a href={shortUrl} className="text-primary underline">
              {shortUrl}
            </a>
          </p>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      )}

      <div className="mt-8">
        <Button onClick={() => router.push('/manage')}>Manage URLs</Button>
      </div>
    </div>
  );
};

export default Home;
