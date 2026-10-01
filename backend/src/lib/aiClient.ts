import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/** Single gateway to the Python AI engine: auth header, timeout and error mapping live here only. */
export async function aiRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.PYTHON_AI_SERVICE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(env.AI_SERVICE_API_KEY ? { 'X-API-Key': env.AI_SERVICE_API_KEY } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(503, 'The AI service is unreachable right now');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AppError(res.status === 422 ? 400 : 502, 'The AI service returned an error', detail.slice(0, 500));
  }
  return (await res.json()) as T;
}

export const aiPost = <T>(path: string, body: unknown) => aiRequest<T>('POST', path, body);
export const aiGet = <T>(path: string) => aiRequest<T>('GET', path);
