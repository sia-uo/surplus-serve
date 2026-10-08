import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '../../../shared/types';
import { api } from './api';

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Minimal data-fetching hook: refetches when `path` changes; `null` path skips fetching. */
export function useQuery<T>(path: string | null): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Paginated list with "load more" that resets when the base path changes. */
export function usePaged<T>(basePath: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState<boolean>(!!basePath);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const pathRef = useRef(basePath);

  const load = useCallback(
    async (p: number, replace: boolean) => {
      if (!basePath) return;
      setLoading(true);
      setError(null);
      try {
        const sep = basePath.includes('?') ? '&' : '?';
        const res = await api.get<Paginated<T>>(`${basePath}${sep}page=${p}`);
        if (pathRef.current !== basePath) return;
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasMore(res.hasMore);
        setPage(p);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [basePath],
  );

  useEffect(() => {
    pathRef.current = basePath;
    setItems([]);
    void load(1, true);
  }, [basePath, nonce, load]);

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore: () => load(page + 1, false),
    reload: () => setNonce((n) => n + 1),
    setItems,
  };
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · SurplusServe` : 'SurplusServe';
  }, [title]);
}
