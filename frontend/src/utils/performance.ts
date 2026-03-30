/**
 * Performance optimization utilities for React components
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';

/**
 * Create a memoized component with deep comparison for props
 */
export function withDeepMemo<P extends object>(Component: React.ComponentType<P>) {
  return memo(Component, (prevProps, nextProps) => {
    // Deep comparison of props
    return JSON.stringify(prevProps) === JSON.stringify(nextProps);
  });
}

/**
 * Debounce hook for optimizing frequent updates
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle hook for optimizing frequent function calls
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): T {
  const lastRun = useRef(Date.now());

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRun.current >= delay) {
        lastRun.current = now;
        callback(...args);
      }
    },
    [callback, delay]
  ) as T;
}

/**
 * Lazy load data with caching
 */
export class DataCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl: number; // Time to live in milliseconds

  constructor(ttl: number = 60000) {
    this.ttl = ttl;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

/**
 * Memoize expensive computations
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps) as T;
}

/**
 * Optimize list rendering with virtualization hints
 */
export function createVirtualizedListConfig(
  itemHeight: number,
  visibleItems: number
) {
  return {
    itemHeight,
    visibleItems,
    bufferSize: Math.ceil(visibleItems / 2),
    estimatedTotalHeight: itemHeight * visibleItems,
  };
}
