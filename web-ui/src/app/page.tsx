'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createURL } from '@/services/api/url';

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
    } catch (error) {
      console.error('Error shortening URL:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="text-5xl font-bold mb-8 text-blue-600">BearLink</h1>
      <p className="mb-8 text-xl text-gray-700">Shorten your URLs with ease and track their performance!</p>
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white p-8 rounded shadow">
        <div className="mb-4">
          <label htmlFor="originalUrl" className="block text-gray-700 text-sm font-bold mb-2">
            Original URL
          </label>
          <input
            type="url"
            id="originalUrl"
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            placeholder="Enter your URL"
            required
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Shorten
        </button>
      </form>
      {shortUrl && (
        <div className="mt-8">
          <p className="text-lg">
            Short URL: <a href={shortUrl} className="text-blue-600 underline">{shortUrl}</a>
          </p>
        </div>
      )}
      <div className="mt-8">
        <button
          onClick={() => router.push('/manage')}
          className="ml-4 bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Manage URLs
        </button>
      </div>
    </div>
  );
};

export default Home;
