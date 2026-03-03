'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createURL } from '@/services/api/url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

const Home = () => {
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [shortUrl, setShortUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem('user')) {
      router.push('/login');
    } else {
      setIsLoading(false);
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await createURL(originalUrl);
      setShortUrl(response.data.shortUrl);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to shorten URL';
      toast.error(message);
    }
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
            <Button type="submit" className="w-full">
              Shorten
            </Button>
          </form>
        </CardContent>
      </Card>
      {shortUrl && (
        <div className="mt-8">
          <p className="text-lg">
            Short URL:{' '}
            <a href={shortUrl} className="text-primary underline">
              {shortUrl}
            </a>
          </p>
        </div>
      )}
      <div className="mt-8">
        <Button onClick={() => router.push('/manage')}>Manage URLs</Button>
      </div>
    </div>
  );
};

export default Home;
