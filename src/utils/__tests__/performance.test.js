import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, createCache, shouldUseVirtualScroll, batchUpdate } from '../performance';

describe('Performance Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only execute the last call when called multiple times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('third');
    });

    it('should reset timer on each call', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 300);

      debouncedFn();
      vi.advanceTimersByTime(200);
      debouncedFn();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should limit function execution frequency', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 300);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(300);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should execute immediately on first call', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 300);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCache', () => {
    it('should store and retrieve data', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      const cache = createCache(5000);
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should expire data after TTL', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(5001);
      expect(cache.get('key1')).toBeNull();
    });

    it('should check if key exists', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete specific keys', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all data', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should clear expired entries', () => {
      const cache = createCache(5000);
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(3000);
      cache.set('key2', 'value2');
      vi.advanceTimersByTime(2500);

      cache.clearExpired();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return cache size', () => {
      const cache = createCache(5000);
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('shouldUseVirtualScroll', () => {
    it('should return true when item count exceeds threshold', () => {
      expect(shouldUseVirtualScroll(101)).toBe(true);
      expect(shouldUseVirtualScroll(150)).toBe(true);
    });

    it('should return false when item count is below threshold', () => {
      expect(shouldUseVirtualScroll(100)).toBe(false);
      expect(shouldUseVirtualScroll(50)).toBe(false);
    });

    it('should use custom threshold', () => {
      expect(shouldUseVirtualScroll(51, 50)).toBe(true);
      expect(shouldUseVirtualScroll(50, 50)).toBe(false);
    });
  });

  describe('batchUpdate', () => {
    it('should collect updates and execute in batch', () => {
      const fn = vi.fn();
      const batchFn = batchUpdate(fn, 100);

      batchFn('update1');
      batchFn('update2');
      batchFn('update3');

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(['update1', 'update2', 'update3']);
    });

    it('should reset batch on each update', () => {
      const fn = vi.fn();
      const batchFn = batchUpdate(fn, 100);

      batchFn('update1');
      vi.advanceTimersByTime(50);
      batchFn('update2');
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(['update1', 'update2']);
    });
  });
});
