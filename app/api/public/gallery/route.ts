import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { NextResponse } from "next/server";
import { getGalleryPhotos } from "@/services/tenantService";
import { resolvePublicTenantId } from "@/lib/public-tenant";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export async function GET(request: Request) {
  const limit = checkRateLimit(getClientIp(request), 'public-gallery', { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const tenantId = await resolvePublicTenantId(request);

    if (!tenantId) {
      return NextResponse.json([], {
        status: 200,
        headers: corsHeaders,
      });
    }

    const photos = await getGalleryPhotos(tenantId);

    return NextResponse.json(photos, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("Erro ao buscar galeria pública:", error);
    return NextResponse.json(
      { error: error.message ?? "Erro interno ao buscar galeria" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
