/**
 * Server-side bridge to the Psychometric AI backend (source of truth).
 *
 * The browser talks ONLY to same-origin `/api/*`. This handler forwards the
 * request to the Express psychometric service (127.0.0.1:4000) and returns
 * its response untouched — envelope, status codes and error bodies included.
 *
 * Why a proxy: the backend enforces a strict CORS allowlist by design; the
 * gateway preview origin is dynamic. Forwarding server-side keeps the backend
 * untouched, avoids CORS entirely, and means the frontend ships with zero
 * hardcoded backend URLs.
 *
 * No business logic lives here. Nothing is cached. Authorization travels via
 * the client's Bearer token, exactly as the API contract requires.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL =
  process.env.PSYCHOMETRIC_BACKEND_URL || "http://127.0.0.1:4000";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "host",
  "content-length",
  "accept-encoding",
  // request-context headers: this call originates from the Next server, not
  // the browser, so browser CORS metadata must not be forwarded (the backend
  // enforces a strict origin allowlist by design).
  "origin",
  "referer",
  "cookie",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

async function forward(req: NextRequest, segments: string[]) {
  const search = req.nextUrl.search || "";
  const target = `${BACKEND_URL}/api/${segments.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) resHeaders.set(key, value);
    });

    const payload = await upstream.arrayBuffer();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch {
    // Never leak infrastructure details to the client (privacy contract).
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "The assessment service is temporarily unavailable. Please try again in a moment.",
        },
      },
      { status: 503 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
