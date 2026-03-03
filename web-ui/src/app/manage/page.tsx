'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getURLs, deleteURL, updateURL } from '@/services/api/url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
    if (!localStorage.getItem('user')) {
      router.push('/login');
      return;
    }

    const fetchUrls = async () => {
      try {
        const response = await getURLs();
        setUrls(response.data.data);
      } catch (error: unknown) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to fetch URLs';
        toast.error(message);
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
      setUrls(urls.map((url) => (url.id === id ? { ...url, originalUrl: newOriginalUrl } : url)));
      setEditingUrl(null);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update URL';
      toast.error(message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteURL(id);
      setUrls(urls.filter((url) => url.id !== id));
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete URL';
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
      <h1 className="text-5xl font-bold mb-8 text-primary">Manage BearLink URLs</h1>
      <Card className="w-full max-w-4xl">
        <CardContent className="pt-6">
          {urls.length === 0 ? (
            <p>No URLs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20"></TableHead>
                  <TableHead className="w-36">Short URL</TableHead>
                  <TableHead>Original URL</TableHead>
                  <TableHead className="w-16 text-center">Clicks</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {urls.map((url) => (
                  <TableRow key={url.id}>
                    <TableCell className="w-20 text-center">
                      {url.previewImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url.previewImageUrl}
                          alt=""
                          className="object-cover rounded w-12 h-12 mx-auto"
                        />
                      ) : (
                        <div className="w-12 h-12 mx-auto bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                          {url.previewFetchedAt ? 'N/A' : '...'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`${urlServiceUrl}/${url.shortId}`}
                        className="text-primary underline"
                      >
                        {url.shortId}
                      </a>
                    </TableCell>
                    <TableCell>
                      {editingUrl === url.id ? (
                        <Input
                          type="text"
                          value={newOriginalUrl}
                          onChange={(e) => setNewOriginalUrl(e.target.value)}
                        />
                      ) : (
                        <div>
                          <span>{url.originalUrl}</span>
                          {url.previewTitle && (
                            <div className="text-sm font-medium text-foreground mt-1 truncate">
                              {url.previewTitle}
                            </div>
                          )}
                          {url.previewDescription && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {url.previewDescription}
                            </div>
                          )}
                          {!url.previewFetchedAt && (
                            <div className="text-xs text-muted-foreground italic mt-0.5">
                              Preview loading...
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {url.customAlias && (
                              <Badge variant="secondary">alias: {url.customAlias}</Badge>
                            )}
                            {url.expiresAt && (
                              <Badge variant="outline">
                                Expires: {new Date(url.expiresAt).toLocaleDateString()}
                              </Badge>
                            )}
                            {url.tags && url.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{url.clicks}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2 justify-center">
                        {editingUrl === url.id ? (
                          <Button size="sm" onClick={() => handleSave(url.id)}>
                            Save
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(url.id, url.originalUrl)}
                          >
                            Edit
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {url.shortId}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the short URL and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(url.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageURLs;
