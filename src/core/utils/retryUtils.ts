/**
 * Utilitário de Retry com Exponential Backoff e Jitter
 * Projetado para resiliência contra erros 503 (UNAVAILABLE), 429 (Rate Limit) e falhas transitórias de rede.
 */

export interface RetryOptions {
  /** Número máximo de tentativas (default: 3) */
  maxRetries?: number;
  /** Delay inicial em ms (default: 2000 ms) */
  initialDelayMs?: number;
  /** Delay máximo em ms (default: 10000 ms) */
  maxDelayMs?: number;
  /** Fator de multiplicação exponencial (default: 2) */
  backoffFactor?: number;
  /** Se deve adicionar jitter aleatório de +/- 20% para evitar concorrência sincronizada (default: true) */
  jitter?: boolean;
  /** Identificador de contexto para logging (ex: 'ParallelAI:Gemini') */
  contextTag?: string;
  /** Função customizada para decidir se o erro é retentável */
  isRetryable?: (error: any) => boolean;
  /** Callback disparado antes de cada retry */
  onRetry?: (error: any, attempt: number, delayMs: number) => void;
}

/**
 * Avalia se um erro é temporário/recuperável (ex: 503 Service Unavailable, 429 Rate Limit, timeouts de conexão).
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;

  const status = error?.status || error?.statusCode || error?.response?.status || error?.cause?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 408) {
    return true;
  }

  const msg = (
    (typeof error === 'string' ? error : error?.message || '') +
    ' ' +
    (error?.code || '') +
    ' ' +
    (error?.details || '') +
    ' ' +
    (typeof error?.response?.data === 'string' ? error.response.data : JSON.stringify(error?.response?.data || ''))
  ).toLowerCase();

  const retryableKeywords = [
    '503',
    '429',
    'unavailable',
    'service unavailable',
    'resource_exhausted',
    'resource exhausted',
    'rate limit',
    'rate_limit',
    'too many requests',
    'quota',
    'high demand',
    'overloaded',
    'econnreset',
    'etimedout',
    'und_err_connect_timeout',
    'fetch failed',
    'timeout',
    'network error',
    'socket hang up',
    'server error',
    '502',
    '504',
  ];

  return retryableKeywords.some((kw) => msg.includes(kw));
}

/**
 * Executa uma função assíncrona com repetição automática (Retry) e espera exponencial (Exponential Backoff).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 2000,
    maxDelayMs = 10000,
    backoffFactor = 2,
    jitter = true,
    contextTag = 'AI',
    isRetryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      const retryable = isRetryable(error);

      if (isLastAttempt || !retryable) {
        if (!retryable) {
          console.warn(
            `[Retry:${contextTag}] Erro não-recuperável detectado na tentativa ${attempt}/${maxRetries}:`,
            error?.message || String(error)
          );
        } else {
          console.error(
            `[Retry:${contextTag}] ❌ Esgotadas todas as ${maxRetries} tentativas. Último erro:`,
            error?.message || String(error)
          );
        }
        throw error;
      }

      // Cálculo do backoff exponencial: initialDelayMs * backoffFactor^(attempt - 1)
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      if (jitter) {
        const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8x a 1.2x
        delay = Math.round(delay * jitterFactor);
      }
      delay = Math.min(delay, maxDelayMs);

      const errMessage = error?.message || String(error);
      const shortErr = errMessage.length > 150 ? errMessage.slice(0, 150) + '...' : errMessage;

      console.warn(
        `[Retry:${contextTag}] ⚠️ Falha na tentativa ${attempt}/${maxRetries} (${shortErr}). Aguardando ${delay}ms para tentar novamente...`
      );

      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
