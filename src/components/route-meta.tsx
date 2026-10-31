import { useEffect } from "react";
import { useLocation } from "react-router";
import { applyPageMeta } from "@/lib/document-meta";
import { routeMeta } from "@/lib/seo";

/** Keeps the document metadata in step with client-side navigation. */
export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    applyPageMeta(routeMeta(pathname));
  }, [pathname]);
  return null;
}
