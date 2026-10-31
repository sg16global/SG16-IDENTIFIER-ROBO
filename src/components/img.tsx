import type { CSSProperties } from "react";
import { preload as preloadResource } from "react-dom";
import { IMAGE_WIDTHS, imageUrl } from "@/lib/images";

/**
 * Responsive image served through the Worker's resizer (/api/image, backed by
 * the Cloudflare Images binding), which returns AVIF/WebP at the requested
 * width. The 1.4 MB logo and 2.1 MB Robo Manager portrait would otherwise be
 * downloaded at full size. Markup matches what next/image produced, so the
 * existing CSS (.robo__img and friends) applies unchanged.
 */

type ImgProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** As the HTML attribute; with it, every width is offered and the browser picks. */
  sizes?: string;
  /** Fill the nearest positioned ancestor. */
  fill?: boolean;
  /** Above-the-fold image: fetch at high priority and preload. */
  preload?: boolean;
  className?: string;
  quality?: number;
};

const FILL_STYLE: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", color: "transparent" };
const FIXED_STYLE: CSSProperties = { color: "transparent" };

export function Img({ src, alt, width, height, sizes, fill = false, preload = false, className, quality = 75 }: ImgProps) {
  let srcSet: string;
  let fallback: string;
  if (sizes || !width) {
    srcSet = IMAGE_WIDTHS.map((w) => `${imageUrl(src, w, quality)} ${w}w`).join(", ");
    fallback = imageUrl(src, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1], quality);
  } else {
    const at = (target: number) => IMAGE_WIDTHS.find((w) => w >= target) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
    srcSet = `${imageUrl(src, at(width), quality)} 1x, ${imageUrl(src, at(width * 2), quality)} 2x`;
    fallback = imageUrl(src, at(width * 2), quality);
  }
  if (preload) preloadResource(fallback, { as: "image", imageSrcSet: srcSet, imageSizes: sizes, fetchPriority: "high" });

  return (
    <img
      alt={alt}
      src={fallback}
      srcSet={srcSet}
      sizes={sizes}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      decoding="async"
      loading={preload ? "eager" : "lazy"}
      fetchPriority={preload ? "high" : undefined}
      className={className}
      style={fill ? FILL_STYLE : FIXED_STYLE}
    />
  );
}
