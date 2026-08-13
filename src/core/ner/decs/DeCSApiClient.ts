/**
 * DeCS/MeSH API Client (BIREME-OPAS/OMS V2 API)
 * Node-only diagnostic / enrichment client.
 * NEVER called in hot path of NER engines or per-chunk processing.
 */

export interface DecsApiResponse {
  success: boolean;
  data: any;
  error?: string;
}

export class DeCSApiClient {
  private apiBase: string;
  private apiToken: string;

  constructor(apiToken?: string, apiBase?: string) {
    this.apiToken = apiToken || process.env.DECS_API_TOKEN || '';
    this.apiBase = (apiBase || process.env.DECS_API_BASE || 'https://api.bvsalud.org/decs/v2').replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiToken && this.apiToken.trim().length > 0);
  }

  private async fetchApi(endpoint: string, params: Record<string, string> = {}): Promise<DecsApiResponse> {
    if (!this.isConfigured()) {
      return { success: false, data: null, error: 'DECS_API_TOKEN not configured in environment' };
    }

    const query = new URLSearchParams({ lang: 'pt', format: 'json', ...params }).toString();
    const url = `${this.apiBase}/${endpoint}?${query}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': this.apiToken,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: err.name === 'AbortError' ? 'API request timeout' : err.message || String(err),
      };
    }
  }

  /**
   * Fetches tree nodes by tree_id (e.g. 'A01', 'C14')
   */
  public async getTree(treeId: string): Promise<DecsApiResponse> {
    return this.fetchApi('get-tree', { tree_id: treeId });
  }

  /**
   * Searches descriptors by keyword
   */
  public async searchByWords(words: string): Promise<DecsApiResponse> {
    return this.fetchApi('search-by-words', { words });
  }

  /**
   * Boolean search
   */
  public async searchBoolean(boolQuery: string): Promise<DecsApiResponse> {
    return this.fetchApi('search-boolean', { bool: boolQuery });
  }
}

export const decsApiClient = new DeCSApiClient();
