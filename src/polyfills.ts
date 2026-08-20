/**
 * Polyfills essenciais para compatibilidade do MedAnki com WebViews móveis (iOS WKWebView / Android WebView)
 * e motores JS legados.
 *
 * Deve ser importado como a PRIMEIRA linha no entry point (main.tsx) e em qualquer módulo/worker
 * antes de carregar bibliotecas como pdfjs-dist ou tesseract.js.
 */

// 1. Map.prototype.getOrInsertComputed & getOrInsert (TC39 Upsert Proposal)
if (typeof Map !== 'undefined') {
  if (typeof (Map.prototype as any).getOrInsertComputed !== 'function') {
    (Map.prototype as any).getOrInsertComputed = function <K, V>(
      this: Map<K, V>,
      key: K,
      callbackFn: (k: K) => V
    ): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      const value = callbackFn(key);
      this.set(key, value);
      return value;
    };
  }

  if (typeof (Map.prototype as any).getOrInsert !== 'function') {
    (Map.prototype as any).getOrInsert = function <K, V>(
      this: Map<K, V>,
      key: K,
      defaultValue: V
    ): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

// 2. WeakMap.prototype.getOrInsertComputed & getOrInsert (TC39 Upsert Proposal)
if (typeof WeakMap !== 'undefined') {
  if (typeof (WeakMap.prototype as any).getOrInsertComputed !== 'function') {
    (WeakMap.prototype as any).getOrInsertComputed = function <K extends object, V>(
      this: WeakMap<K, V>,
      key: K,
      callbackFn: (k: K) => V
    ): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      const value = callbackFn(key);
      this.set(key, value);
      return value;
    };
  }

  if (typeof (WeakMap.prototype as any).getOrInsert !== 'function') {
    (WeakMap.prototype as any).getOrInsert = function <K extends object, V>(
      this: WeakMap<K, V>,
      key: K,
      defaultValue: V
    ): V {
      if (this.has(key)) {
        return this.get(key)!;
      }
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
}

// 3. Promise.withResolvers (ES2024)
if (typeof Promise !== 'undefined' && typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// 4. Object.groupBy & Map.groupBy (ES2024)
if (typeof Object !== 'undefined' && typeof (Object as any).groupBy !== 'function') {
  (Object as any).groupBy = function <T, K extends PropertyKey>(
    items: Iterable<T>,
    callbackFn: (item: T, index: number) => K
  ): Partial<Record<K, T[]>> {
    const result: Partial<Record<K, T[]>> = {};
    let index = 0;
    for (const item of items) {
      const key = callbackFn(item, index++);
      if (!result[key]) {
        result[key] = [];
      }
      result[key]!.push(item);
    }
    return result;
  };
}

export {};
