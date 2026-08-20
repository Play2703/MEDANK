import { describe, it, expect } from 'vitest';
import './polyfills';

describe('polyfills - TC39 Map/WeakMap Upsert & Modern JS APIs', () => {
  it('Map.prototype.getOrInsertComputed deve retornar valor existente ou computar e inserir se ausente', () => {
    const map = new Map<string, number[]>();

    // 1. Chave não existe: computa via callback
    const computed1 = (map as any).getOrInsertComputed('chave_a', (k: string) => [1, 2, 3]);
    expect(computed1).toEqual([1, 2, 3]);
    expect(map.get('chave_a')).toEqual([1, 2, 3]);

    // 2. Chave já existe: não chama callback e retorna existente
    let called = false;
    const computed2 = (map as any).getOrInsertComputed('chave_a', () => {
      called = true;
      return [9, 9, 9];
    });
    expect(computed2).toEqual([1, 2, 3]);
    expect(called).toBe(false);
  });

  it('Map.prototype.getOrInsert deve retornar valor existente ou inserir default', () => {
    const map = new Map<string, string>();

    const val1 = (map as any).getOrInsert('user_1', 'default_user');
    expect(val1).toBe('default_user');
    expect(map.get('user_1')).toBe('default_user');

    const val2 = (map as any).getOrInsert('user_1', 'outro_user');
    expect(val2).toBe('default_user');
  });

  it('WeakMap.prototype.getOrInsertComputed deve funcionar com chaves de objeto', () => {
    const weakMap = new WeakMap<object, { id: number }>();
    const objKey = {};

    const res1 = (weakMap as any).getOrInsertComputed(objKey, () => ({ id: 42 }));
    expect(res1).toEqual({ id: 42 });
    expect(weakMap.get(objKey)).toEqual({ id: 42 });

    let called = false;
    const res2 = (weakMap as any).getOrInsertComputed(objKey, () => {
      called = true;
      return { id: 99 };
    });
    expect(res2).toEqual({ id: 42 });
    expect(called).toBe(false);
  });

  it('Promise.withResolvers deve criar promise com resolve e reject desacoplados', async () => {
    const { promise, resolve } = (Promise as any).withResolvers();
    resolve('sucesso');
    const res = await promise;
    expect(res).toBe('sucesso');
  });
});
