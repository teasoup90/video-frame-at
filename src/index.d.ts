export type VideoSource = string | URL | Blob;
export type FrameTime = number | 'first' | 'last';
export type FrameOutput = 'blob' | 'canvas' | 'imageBitmap';
export interface FrameOptions<O extends FrameOutput = FrameOutput> {
  output?: O;
  format?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  timeoutMs?: number;
  crossOrigin?: 'anonymous' | 'use-credentials' | null;
  signal?: AbortSignal;
}
export type FrameResult<O extends FrameOutput> =
  O extends 'canvas' ? HTMLCanvasElement : O extends 'imageBitmap' ? ImageBitmap : Blob;
export class FrameExtractionError extends Error {
  code: 'CORS' | 'MEDIA' | 'TIMEOUT' | 'DECODE' | 'ENCODE' | 'FORMAT_UNSUPPORTED' | 'UNSUPPORTED';
  constructor(code: FrameExtractionError['code'], message: string, cause?: unknown);
}
export function frameAt<O extends FrameOutput = 'blob'>(
  source: VideoSource, time: FrameTime, options?: FrameOptions<O>
): Promise<FrameResult<O>>;
export function firstFrame<O extends FrameOutput = 'blob'>(
  source: VideoSource, options?: FrameOptions<O>
): Promise<FrameResult<O>>;
export function lastFrame<O extends FrameOutput = 'blob'>(
  source: VideoSource, options?: FrameOptions<O>
): Promise<FrameResult<O>>;
