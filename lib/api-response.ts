import { NextResponse } from "next/server";

/**
 * Consistent JSON error envelope for API routes: `{ error: string }`.
 * Establishes the response shape convention for this and future API specs.
 */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
