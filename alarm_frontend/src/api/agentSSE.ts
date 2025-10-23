/**
 * SSE Client for PVCI Agent streaming endpoint
 * Handles real-time event streaming from the agent backend
 */

export type AgentEventType =
  | 'reasoning'
  | 'answer_stream'
  | 'tool_call'
  | 'tool_call_update'
  | 'tool_result'
  | 'answer_complete'
  | 'complete'
  | 'error';

export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  data?: unknown;
  message?: string;
  sessionId?: string;
  requestId?: string;
  plant?: string;
}

export interface StreamRequest {
  query: string;
  plant: string;
  sessionId: string;
  requestId: string;
}

export interface StreamCallbacks {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Connect to PVCI Agent SSE streaming endpoint
 * @param request Stream request payload
 * @param callbacks Event callbacks
 * @returns AbortController to cancel the stream
 */
export async function streamAgentQuery(
  request: StreamRequest,
  callbacks: StreamCallbacks
): Promise<AbortController> {
  const abortController = new AbortController();
  const API_BASE =
    (typeof window !== 'undefined' && (window as any).__APP_CONFIG__?.API_BASE_URL) ||
    import.meta.env.VITE_API_URL ||
    'http://127.0.0.1:8000';

  try {
    const response = await fetch(`${API_BASE}/agent/pvci/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Read stream
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        callbacks.onComplete?.();
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by \n\n)
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        // SSE format: "data: {json}\n"
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6).trim();
          try {
            const event: AgentEvent = JSON.parse(jsonStr);
            callbacks.onEvent(event);

            // Auto-complete on complete event
            if (event.type === 'complete') {
              callbacks.onComplete?.();
              reader.cancel();
              return abortController;
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', jsonStr, e);
          }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('Stream aborted by user');
    } else {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('Stream error:', e);
      callbacks.onError?.(e);
    }
  }

  return abortController;
}

/**
 * Generate a unique request ID (UUID v4)
 */
export function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a session ID (simpler format)
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
