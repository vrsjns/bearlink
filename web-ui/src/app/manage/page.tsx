'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getURLs, deleteURL, updateURL } from '@/services/api/url';

interface URL {
    id: number;
    originalUrl: string;
    shortId: string;
    customAlias: string | null;
    redirectType: number;
    expiresAt: string | null;
    tags: string[];
    requireSignature: boolean;
    clicks: number;
    createdAt: string;
    previewTitle: string | null;
    previewDescription: string | null;
    previewImageUrl: string | null;
    previewFetchedAt: string | null;
}

const urlServiceUrl = process.env.NEXT_PUBLIC_URL_SERVICE_URL;

const ManageURLs = () => {
    const [urls, setUrls] = useState<URL[]>([]);
    const [editingUrl, setEditingUrl] = useState<number | null>(null);
    const [newOriginalUrl, setNewOriginalUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        const fetchUrls = async () => {
            try {
                const response = await getURLs();
                setUrls(response.data.data);
            } catch (error) {
                console.error('Error fetching URLs:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUrls();
    }, [router]);

    const handleEdit = (id: number, originalUrl: string) => {
        setEditingUrl(id);
        setNewOriginalUrl(originalUrl);
    };

    const handleSave = async (id: number) => {
        try {
            await updateURL(id, newOriginalUrl);
            setUrls(urls.map(url => (url.id === id ? { ...url, originalUrl: newOriginalUrl } : url)));
            setEditingUrl(null);
        } catch (error) {
            console.error('Error updating URL:', error);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteURL(id);
            setUrls(urls.filter(url => url.id !== id));
        } catch (error) {
            console.error('Error deleting URL:', error);
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
            <h1 className="text-5xl font-bold mb-8 text-blue-600">Manage BearLink URLs</h1>
            <div className="w-full max-w-4xl bg-white p-8 rounded shadow">
                {urls.length === 0 ? (
                    <p>No URLs found.</p>
                ) : (
                    <table className="w-full table-fixed">
                        <thead>
                            <tr>
                                <th className="px-2 py-2 w-20"></th>
                                <th className="px-4 py-2 w-36">Short URL</th>
                                <th className="px-4 py-2">Original URL</th>
                                <th className="px-4 py-2 w-16 text-center">Clicks</th>
                                <th className="px-4 py-2 w-48">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {urls.map(url => (
                                <tr key={url.id}>
                                    <td className="border px-2 py-2 w-20 text-center">
                                        {url.previewImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={url.previewImageUrl}
                                                alt=""
                                                className="object-cover rounded w-12 h-12 mx-auto"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 mx-auto bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                                                {url.previewFetchedAt ? 'N/A' : '...'}
                                            </div>
                                        )}
                                    </td>
                                    <td className="border px-4 py-2"><a href={`${urlServiceUrl}/${url.shortId}`} className="text-blue-600 underline">{url.shortId}</a></td>
                                    <td className="border px-4 py-2">
                                        {editingUrl === url.id ? (
                                            <input
                                                type="text"
                                                value={newOriginalUrl}
                                                onChange={(e) => setNewOriginalUrl(e.target.value)}
                                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                            />
                                        ) : (
                                            <div>
                                                <span>{url.originalUrl}</span>
                                                {url.previewTitle && (
                                                    <div className="text-sm font-medium text-gray-700 mt-1 truncate">{url.previewTitle}</div>
                                                )}
                                                {url.previewDescription && (
                                                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{url.previewDescription}</div>
                                                )}
                                                {!url.previewFetchedAt && (
                                                    <div className="text-xs text-gray-400 italic mt-0.5">Preview loading...</div>
                                                )}
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {url.customAlias && (
                                                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">alias: {url.customAlias}</span>
                                                    )}
                                                    {url.expiresAt && (
                                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Expires: {new Date(url.expiresAt).toLocaleDateString()}</span>
                                                    )}
                                                    {url.tags && url.tags.map(tag => (
                                                        <span key={tag} className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="border px-4 py-2 text-center">{url.clicks}</td>
                                    <td className="border px-4 py-2">
                                        <div className="flex space-x-2 justify-center">
                                            {editingUrl === url.id ? (
                                                <button
                                                    onClick={() => handleSave(url.id)}
                                                    className="bg-green-600 hover:bg-green-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                                                >
                                                    Save
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleEdit(url.id, url.originalUrl)}
                                                    className="bg-yellow-600 hover:bg-yellow-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(url.id)}
                                                className="bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ml-2"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ManageURLs;
