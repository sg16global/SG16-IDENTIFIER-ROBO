import type { PageMeta } from "@/lib/seo";

function setMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.append(tag);
  }
  tag.content = content;
}

/** Applies a page's title, description and robots directive to the live document. */
export function applyPageMeta(meta: Pick<PageMeta, "title" | "description" | "robots">) {
  document.title = meta.title;
  setMeta("description", meta.description);
  setMeta("robots", meta.robots);
}
