import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useFocusEffect } from 'expo-router';

export interface Loaded<T> {
  data: T | undefined;
  error: Error | undefined;
  /** First load (or after an error): show the skeleton. */
  loading: boolean;
  refreshing: boolean;
  /** `silent` keeps the current content on screen (pull to refresh, timer, focus). */
  reload: (silent?: boolean) => Promise<void>;
}

/** Loads `load()` when `deps` change; the latest call wins. Screens show loading/error/data. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const run = useCallback(load, deps);

  const reload = useCallback(
    async (silent = false) => {
      const id = ++seq.current;
      if (silent) setRefreshing(true);
      else setState((s) => ({ ...s, loading: true, error: undefined }));
      try {
        const data = await run();
        if (id === seq.current) setState({ data, loading: false });
      } catch (e) {
        if (id === seq.current)
          setState((s) => (silent && s.data ? s : { error: e as Error, loading: false }));
      } finally {
        if (id === seq.current) setRefreshing(false);
      }
    },
    [run],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, refreshing, reload } as Loaded<T>;
}

/** Silent reload when the screen comes back into focus (skips the first focus). */
export function useRefreshOnFocus(reload: (silent?: boolean) => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else void reload(true);
    }, [reload]),
  );
}
