import { Outlet, ScrollRestoration } from "react-router";
import { ChatWidget } from "@/components/chat-widget";
import { RouteMeta } from "@/components/route-meta";
import { ScrollProgress, SiteFooter, SiteHeader } from "@/components/ui";
import { WorldAiRail } from "@/components/world-ai-rail";

/**
 * Site chrome shared by every page. The document <head> (fonts, favicon,
 * viewport, default metadata) lives in index.html.
 */
export default function App() {
  return (
    <>
      <ScrollProgress />
      <SiteHeader />
      <main className="relative">
        <Outlet />
      </main>
      <WorldAiRail />
      <SiteFooter />
      <ChatWidget />
      <RouteMeta />
      {/* Top of the page on navigation, saved position on back/forward, #hash targets. */}
      <ScrollRestoration />
    </>
  );
}
