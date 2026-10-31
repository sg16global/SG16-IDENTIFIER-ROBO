import type { AnchorHTMLAttributes, Ref } from "react";
import { Link as RouterLink } from "react-router";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
};

/**
 * In-app paths navigate client-side through React Router; absolute URLs,
 * mailto:/tel: and same-page #hash links stay plain anchors.
 */
export function Link({ href, ...props }: LinkProps) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return <a href={href} {...props} />;
  return <RouterLink to={href} {...props} />;
}
