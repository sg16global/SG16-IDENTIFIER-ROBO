import { createBrowserRouter } from "react-router";
import App from "@/App";
import HomePage from "@/pages/Home";

/**
 * Every page of the site. The home page ships in the main bundle; the others
 * load on first visit. Paths here must match routeMeta() in src/lib/seo.ts and
 * the page routes in wrangler.jsonc ("run_worker_first").
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    // Shown only while a lazily loaded page arrives on a first visit.
    HydrateFallback: () => null,
    children: [
      { index: true, element: <HomePage /> },
      { path: "identify", lazy: async () => ({ Component: (await import("@/pages/Identify")).default }) },
      { path: "business", lazy: async () => ({ Component: (await import("@/pages/Business")).default }) },
      { path: "blueprint", lazy: async () => ({ Component: (await import("@/pages/Blueprint")).default }) },
      { path: "admin", lazy: async () => ({ Component: (await import("@/pages/Admin")).default }) },
      { path: "legal/:doc", lazy: async () => ({ Component: (await import("@/pages/Legal")).default }) },
      { path: "tools/:slug", lazy: async () => ({ Component: (await import("@/pages/Tool")).default }) },
      { path: "report/:id", lazy: async () => ({ Component: (await import("@/pages/Report")).default }) },
      { path: "*", lazy: async () => ({ Component: (await import("@/pages/NotFound")).default }) },
    ],
  },
]);
