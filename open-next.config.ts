// OpenNext → Cloudflare adapter config.
// Default cloudflare config: no KV/Durable Object caches required for this app
// (all /api routes are force-dynamic, pages are client-side hash routes).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
