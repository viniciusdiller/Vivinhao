'use server';

import { createReservationWithRules, type ManualReservationInput } from '@/services/reservationService';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import type { Reservation } from '@/types/domain';

export async function createManualReservationAction(input: ManualReservationInput): Promise<Reservation> {
  const session = await getVerifiedTenantSession();

  if (!session) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  if (!hasFeatureAccess(session, 'reservations')) {
    throw new Error('Sem permissão para esta ação.');
  }

  if (input.entryType === 'manual_reservation') {
    if (
      !input.roomId ||
      !input.checkIn ||
      !input.checkOut ||
      !input.guestName ||
      !input.guestEmail ||
      !input.guestPhone ||
      !input.guestCpf ||
      input.amount <= 0 ||
      !input.notes
    ) {
      throw new Error('Na reserva manual, todos os campos são obrigatórios.');
    }
  }

  return createReservationWithRules({
    ...input,
    tenantId: session.tenantId,
    // A sessão de administrador por env tem userId negativo (-1) só para não
    // colidir com colaboradores reais — mas created_by_user_id é UNSIGNED no
    // banco, então gravar -1 direto quebra o INSERT ("Out of range value").
    createdByUserId: session.userId > 0 ? session.userId : null,
  });
}
