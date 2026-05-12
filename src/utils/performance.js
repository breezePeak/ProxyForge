/**
 * 性能优化工具函数
 */

/**
 * 防抖函数 - 延迟执行，多次调用只执行最后一次
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 节流函数 - 限制执行频率，在指定时间内只执行一次
 * @param {Function} fn - 要节流的函数
 * @param {number} delay - 时间间隔（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, delay = 300) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
}

/**
 * 创建缓存管理器
 * @param {number} ttl - 缓存过期时间（毫秒）
 * @returns {Object} 缓存管理器对象
 */
export function createCache(ttl = 5 * 60 * 1000) {
  const cache = new Map();

  return {
    get(key) {
      const item = cache.get(key);
      if (!item) return null;

      const now = Date.now();
      if (now - item.timestamp > ttl) {
        cache.delete(key);
        return null;
      }

      return item.data;
    },

    set(key, data) {
      cache.set(key, {
        data,
        timestamp: Date.now()
      });
    },

    has(key) {
      return this.get(key) !== null;
    },

    delete(key) {
      cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    clearExpired() {
      const now = Date.now();
      for (const [key, item] of cache.entries()) {
        if (now - item.timestamp > ttl) {
          cache.delete(key);
        }
      }
    },

    size() {
      return cache.size;
    }
  };
}

/**
 * 检查是否需要虚拟滚动
 * @param {number} itemCount - 列表项数量
 * @param {number} threshold - 阈值（默认100）
 * @returns {boolean} 是否需要虚拟滚动
 */
export function shouldUseVirtualScroll(itemCount, threshold = 100) {
  return itemCount > threshold;
}

/**
 * 批量更新优化 - 收集多个更新操作，一次性执行
 * @param {Function} fn - 批量执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 批量更新函数
 */
export function batchUpdate(fn, delay = 100) {
  let updates = [];
  let timer = null;

  return function (update) {
    updates.push(update);

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn(updates);
      updates = [];
      timer = null;
    }, delay);
  };
}
