import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff, isRetryableError } from './retryUtils';

describe('retryUtils - retryWithBackoff & isRetryableError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRetryableError', () => {
    it('deve identificar erros 503 e 429 como retentáveis', () => {
      expect(isRetryableError({ status: 503, message: 'Service Unavailable' })).toBe(true);
      expect(isRetryableError({ statusCode: 429, message: 'Too Many Requests' })).toBe(true);
      expect(isRetryableError(new Error('UNAVAILABLE: The model is overloaded. Please try again later.'))).toBe(true);
      expect(isRetryableError(new Error('Resource has been exhausted (e.g. check quota).'))).toBe(true);
      expect(isRetryableError(new Error('fetch failed: connect ECONNRESET'))).toBe(true);
    });

    it('deve identificar erros de validação/sintaxe como não-retentáveis', () => {
      expect(isRetryableError({ status: 400, message: 'Bad Request: invalid prompt' })).toBe(false);
      expect(isRetryableError(new Error('Invalid API Key provided.'))).toBe(false);
      expect(isRetryableError(null)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('deve retornar o resultado imediatamente se a função tiver sucesso na 1ª tentativa', async () => {
      const fn = vi.fn().mockResolvedValue('sucesso');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('sucesso');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('deve tentar novamente e ter sucesso se falhar com erro 503 na 1ª tentativa', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ status: 503, message: 'Temporarily unavailable' })
        .mockResolvedValueOnce('recuperado');

      const onRetry = vi.fn();

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        jitter: false,
        onRetry,
      });

      expect(result).toBe('recuperado');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ status: 503 }),
        1,
        10
      );
    });

    it('deve tentar até 3 vezes e falhar se todas as tentativas retornarem erro 429', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 429, message: 'Rate limit exceeded' });

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelayMs: 10,
          jitter: false,
        })
      ).rejects.toMatchObject({ status: 429 });

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('não deve fazer retry para erros não-recuperáveis (ex: 400 Bad Request)', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 400, message: 'Invalid parameter' });

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelayMs: 10,
        })
      ).rejects.toMatchObject({ status: 400 });

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
