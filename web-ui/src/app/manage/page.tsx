'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getURLs, deleteURL, updateURL } from '@/services/api/url';

interface URL {
    id: number;
    originalUrl: string;
    shortId: string;
    clicks: number;
    createdAt: string;
}

const urlServiceUrl = process.env.NEXT_PUBLIC_URL_SERVICE_URL;

const ManageURLs = () => {
    const [urls, setUrls] = useState<URL[]>([]);
    const [editingUrl, setEditingUrl] = useState<number | null>(null);
    const [newOriginalUrl, setNewOriginalUrl] = useState<string>('');
    const router = useRouter();

    useEffect(() => {
        const fetchUrls = async () => {
            try {
                const response = await getURLs();
                setUrls(response.data);
            } catch (error) {
                console.error('Error fetching URLs:', error);
            }
        };
        fetchUrls();
    }, []);

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

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <h1 className="text-5xl font-bold mb-8 text-blue-600">Manage BearLink URLs</h1>
            <div className="w-full max-w-4xl bg-white p-8 rounded shadow">
                {urls.length === 0 ? (
                    <p>No URLs found.</p>
                ) : (
                    <table className="w-full table-auto">
                        <thead>
                            <tr>
                                <th className="px-4 py-2">Short URL</th>
                                <th className="px-4 py-2">Original URL</th>
                                <th className="px-4 py-2">Clicks</th>
                                <th className="px-4 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {urls.map(url => (
                                <tr key={url.id}>
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
                                            url.originalUrl
                                        )}
                                    </td>
                                    <td className="border px-4 py-2">{url.clicks}</td>
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
