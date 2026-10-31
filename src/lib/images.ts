/** Shared by the <Img> component and the Worker's /api/image resizer. */

/** Widths the resizer accepts; srcset candidates come from this list. */
export const IMAGE_WIDTHS: readonly number[] = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/** Local images the resizer may read: files under public/assets. */
export const IMAGE_SOURCE_RE = /^\/assets\/[\w.-]+\.(?:png|jpe?g|webp|gif|avif)$/i;

export function imageUrl(src: string, width: number, quality = 75): string {
  return `/api/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}
