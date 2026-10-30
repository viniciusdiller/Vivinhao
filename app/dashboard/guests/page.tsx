import GuestsView from '@/components/guests-view';
import type { GuestRecord } from '@/components/guests-view';
import { getAuthenticatedSession } from '@/lib/auth';
import { getRooms, getTenantReservations } from '@/services/tenantService';

function getGuestStatus(value: unknown): GuestRecord['status'] {
  if (value === 'pending' || value === 'cancelled') {
    return value;
  }

  return 'confirmed';
}

function getGuestSource(value: unknown): GuestRecord['otaSource'] {
  if (value === 'booking' || value === 'expedia' || value === 'hotels_com') {
    return value;
  }

  return 'manual';
}

function formatDateOnly(value: unknown): string {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function getNightCount(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  const diffInDays = Math.round((end - start) / (1000 * 60 * 60 * 24));

  return Math.max(diffInDays, 0);
}

export default async function GuestsPage() {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const [reservations, rooms] = await Promise.all([
    getTenantReservations(session.tenantId),
    getRooms(session.tenantId),
  ]);

  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const guestHistory = reservations
    .map((reservation) => reservation.toJSON() as Record<string, unknown>)
    .filter(
      (reservation) =>
        reservation.status !== 'blocked' &&
        typeof reservation.guestName === 'string' &&
        reservation.guestName.trim().length > 0,
    )
    .map((reservation) => {
      const room =
        typeof reservation.room === 'object' && reservation.room !== null
          ? (reservation.room as { localRoomId?: string; name?: string })
          : undefined;
      const roomId = room?.localRoomId ?? String(reservation.roomId ?? '');
      const checkIn = formatDateOnly(reservation.checkIn);
      const checkOut = formatDateOnly(reservation.checkOut);

      return {
        id: String(reservation.channexReservationId ?? reservation.id ?? ''),
        roomId,
        roomName: room?.name ?? roomNameById.get(roomId) ?? roomId,
        checkIn,
        checkOut,
        nights: getNightCount(checkIn, checkOut),
        status: getGuestStatus(reservation.status),
        otaSource: getGuestSource(reservation.otaSource),
        channelReference: String(reservation.channelReference ?? ''),
        amount: Number(reservation.amount ?? 0),
        currency: String(reservation.currency ?? 'BRL'),
        customer: {
          name: String(reservation.guestName ?? ''),
          email: String(reservation.guestEmail ?? ''),
          phone: String(reservation.guestPhone ?? ''),
        },
        notes: String(reservation.notes ?? ''),
      } satisfies GuestRecord;
    })
    .sort((left, right) => right.checkIn.localeCompare(left.checkIn));

  return <GuestsView guestHistory={guestHistory as GuestRecord[]} rooms={rooms} />;
}