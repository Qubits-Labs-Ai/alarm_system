import { API_BASE_URL } from './config';

/**
 * Fetches an AI-generated insight for a given chart from the backend.
 * @param chartTitle The title of the chart.
 * @param chartData The data of the chart.
 * @returns A promise that resolves to a markdown string with the insight.
 */
export interface InsightMeta {
  provider?: string;
  model?: string | null;
  cached?: boolean;
  generated_at?: string;
  cache_key?: string;
  finish_reason?: any;
  error?: string;
}

export interface InsightResponse {
  insight: string;
  meta?: InsightMeta;
}

export const getInsight = async (
  chartTitle: string,
  chartData: any,
  options?: { regenerate?: boolean }
): Promise<InsightResponse> => {
  const regenerate = options?.regenerate ? 'true' : 'false';

  try {
    const response = await fetch(`${API_BASE_URL}/insights?regenerate=${regenerate}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chartTitle, chartData }),
    });

    if (!response.ok) {
      // Try to extract FastAPI error detail for better UX
      let serverDetail = '';
      try { 
        const errJson = await response.json();
        serverDetail = errJson?.detail || JSON.stringify(errJson);
      } catch {}
      throw new Error(serverDetail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return result as InsightResponse;
  } catch (error) {
    console.error('Failed to fetch insight:', error);
    if (error instanceof Error) {
      throw error; // Let caller decide how to present
    }
    throw new Error('Unknown error while fetching the insight');
  }
};
