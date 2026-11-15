import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './format';

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

/**
 * Loads once on mount and gives the three screen states (carregando, erro, dados). `load` must be
 * stable (module function or useCallback).
 */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(
    () =>
      load().then(
        (d) => {
          setData(d);
          setError(null);
          setLoading(false);
        },
        (e: unknown) => {
          setError(errorMessage(e));
          setLoading(false);
        },
      ),
    [load],
  );

  useEffect(() => {
    run();
  }, [run]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    run();
  }, [run]);

  return { data, error, loading, reload, setData };
}
