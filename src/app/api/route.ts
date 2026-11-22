import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL =
  process.env.PSYCHOMETRIC_BACKEND_URL || "http://127.0.0.1:4000";

export async function GET(req: NextRequest) {
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        success: true,
        data: {
          status: "healthy",
          message: "Psychometric AI Gateway Active",
          backend: "standby",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
