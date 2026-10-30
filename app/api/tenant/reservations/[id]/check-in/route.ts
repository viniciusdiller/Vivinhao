import { NextResponse } from "next/server";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";
import { checkInReservation } from "@/services/tenantService";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVerifiedTenantSession();
  if (!session) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }
  if (!hasFeatureAccess(session, "check")) {
    return NextResponse.json({ message: "Sem permissão para esta ação." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const reservation = await checkInReservation(session.tenantId, id);
    return NextResponse.json({ reservation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Falha ao realizar check-in." },
      { status: 400 },
    );
  }
}
