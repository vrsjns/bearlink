'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getURLs, deleteURL, downloadQR, updateURL, UpdateURLOptions } from '@/services/api/url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface URLItem {
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
  utmParams: Record<string, string> | null;
}

interface EditForm {
  originalUrl: string;
  customAlias: string;
  expiresAt: string;
  password: string;
  tags: string;
  redirectType: number;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
}

const PAGE_SIZE = 10;
const urlServiceUrl = process.env.NEXT_PUBLIC_URL_SERVICE_URL;

const ManageURLs = () => {
  const [urls, setUrls] = useState<URLItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState<Record<string, boolean>>({});
  const [editingUrl, setEditingUrl] = useState<URLItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUrls = useCallback(async (pg: number, s: string, tag: string, expired: boolean) => {
    setIsLoading(true);
    try {
      const params: Record<string, unknown> = { page: pg, limit: PAGE_SIZE };
      if (s) params.search = s;
      if (tag) params.tag = tag;
      if (expired) params.expired = true;
      const response = await getURLs(params as Parameters<typeof getURLs>[0]);
      const data = response.data;
      setUrls(data.data);
      setTotal(data.pagination?.total ?? 0);
      const tags = Array.from(
        new Set((data.data as URLItem[]).flatMap((u: URLItem) => u.tags ?? []))
      ) as string[];
      setAllTags(tags);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to fetch URLs';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('user')) {
      router.push('/login');
      return;
    }
    fetchUrls(page, debouncedSearch, tagFilter, expiredOnly);
  }, [page, debouncedSearch, tagFilter, expiredOnly, fetchUrls, router]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(value);
    }, 300);
  };

  const handleTagFilter = (tag: string) => {
    setTagFilter(tag);
    setPage(1);
  };

  const handleExpiredToggle = (checked: boolean) => {
    setExpiredOnly(checked);
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteURL(id);
      fetchUrls(page, debouncedSearch, tagFilter, expiredOnly);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete URL';
      toast.error(message);
    }
  };

  const handleDownloadQR = async (shortId: string) => {
    setQrLoading((prev) => ({ ...prev, [shortId]: true }));
    try {
      const blob = await downloadQR(shortId);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${shortId}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Failed to download QR code');
    } finally {
      setQrLoading((prev) => ({ ...prev, [shortId]: false }));
    }
  };

  const openEditModal = (url: URLItem) => {
    setEditingUrl(url);
    const utm = url.utmParams ?? {};
    setEditForm({
      originalUrl: url.originalUrl,
      customAlias: url.customAlias ?? '',
      expiresAt: url.expiresAt ? url.expiresAt.slice(0, 16) : '',
      password: '',
      tags: (url.tags ?? []).join(', '),
      redirectType: url.redirectType,
      utmSource: utm.utm_source ?? '',
      utmMedium: utm.utm_medium ?? '',
      utmCampaign: utm.utm_campaign ?? '',
      utmTerm: utm.utm_term ?? '',
      utmContent: utm.utm_content ?? '',
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUrl(null);
    setEditForm(null);
  };

  const handleSave = async () => {
    if (!editingUrl || !editForm) return;
    const utmParams: Record<string, string> = {};
    if (editForm.utmSource) utmParams.utm_source = editForm.utmSource;
    if (editForm.utmMedium) utmParams.utm_medium = editForm.utmMedium;
    if (editForm.utmCampaign) utmParams.utm_campaign = editForm.utmCampaign;
    if (editForm.utmTerm) utmParams.utm_term = editForm.utmTerm;
    if (editForm.utmContent) utmParams.utm_content = editForm.utmContent;

    const options: UpdateURLOptions = {
      originalUrl: editForm.originalUrl,
      customAlias: editForm.customAlias || undefined,
      expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : null,
      ...(editForm.password && { password: editForm.password }),
      tags: editForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      redirectType: editForm.redirectType,
      utmParams: Object.keys(utmParams).length > 0 ? utmParams : null,
    };

    setIsSaving(true);
    try {
      await updateURL(editingUrl.id, options);
      closeEditModal();
      fetchUrls(page, debouncedSearch, tagFilter, expiredOnly);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update URL';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted p-4">
      <h1 className="text-5xl font-bold mb-8 text-primary">Manage BearLink URLs</h1>

      <div className="w-full max-w-4xl mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by URL or alias..."
          />
        </div>

        <div>
          <Label htmlFor="tagFilter">Tag filter</Label>
          <select
            id="tagFilter"
            value={tagFilter}
            onChange={(e) => handleTagFilter(e.target.value)}
            className="block border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id="expiredOnly"
            checked={expiredOnly}
            onChange={(e) => handleExpiredToggle(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="expiredOnly">Expired only</Label>
        </div>
      </div>

      <Card className="w-full max-w-4xl">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : urls.length === 0 ? (
            <p>No URLs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20"></TableHead>
                  <TableHead className="w-36">Short URL</TableHead>
                  <TableHead>Original URL</TableHead>
                  <TableHead className="w-16 text-center">Clicks</TableHead>
                  <TableHead className="w-56">Actions</TableHead>
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
                    </TableCell>
                    <TableCell className="text-center">{url.clicks}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openEditModal(url)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={qrLoading[url.shortId]}
                          onClick={() => handleDownloadQR(url.shortId)}
                        >
                          {qrLoading[url.shortId] ? '...' : 'QR'}
                        </Button>
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

      <div className="mt-4 flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages} ({total} total)
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      {showEditModal && editForm && editingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Edit URL</h2>

            <div className="space-y-1">
              <Label htmlFor="edit-originalUrl">Original URL</Label>
              <Input
                id="edit-originalUrl"
                type="url"
                value={editForm.originalUrl}
                onChange={(e) => setEditForm({ ...editForm, originalUrl: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-customAlias">Custom alias</Label>
              <Input
                id="edit-customAlias"
                type="text"
                value={editForm.customAlias}
                onChange={(e) => setEditForm({ ...editForm, customAlias: e.target.value })}
                placeholder="my-link"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-expiresAt">Expiry date</Label>
              <Input
                id="edit-expiresAt"
                type="datetime-local"
                value={editForm.expiresAt}
                onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-password">New password (leave blank to keep current)</Label>
              <Input
                id="edit-password"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="New password"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
              <Input
                id="edit-tags"
                type="text"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="marketing, product"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-redirectType">Redirect type</Label>
              <select
                id="edit-redirectType"
                value={editForm.redirectType}
                onChange={(e) => setEditForm({ ...editForm, redirectType: Number(e.target.value) })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value={302}>302 Temporary</option>
                <option value={301}>301 Permanent</option>
              </select>
            </div>

            <div className="space-y-2 border rounded-md p-3">
              <p className="text-sm font-medium">UTM parameters</p>
              {[
                { id: 'utmSource', label: 'utm_source', key: 'utmSource' as const },
                { id: 'utmMedium', label: 'utm_medium', key: 'utmMedium' as const },
                { id: 'utmCampaign', label: 'utm_campaign', key: 'utmCampaign' as const },
                { id: 'utmTerm', label: 'utm_term', key: 'utmTerm' as const },
                { id: 'utmContent', label: 'utm_content', key: 'utmContent' as const },
              ].map(({ id, label, key }) => (
                <div key={id} className="space-y-1">
                  <Label htmlFor={`edit-${id}`}>{label}</Label>
                  <Input
                    id={`edit-${id}`}
                    type="text"
                    value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    placeholder={label}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeEditModal} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageURLs;
