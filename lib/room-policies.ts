export type RoomSeasonalRate = {
  label?: string;
  startMonthDay: string;
  endMonthDay: string;
  price: number;
};

// Estadia mínima por período — independente da tarifa: uma pousada pode
// exigir, por exemplo, 4 noites no Réveillon sem precisar mexer no preço
// (ou vice-versa), daí ser uma lista separada de RoomSeasonalRate em vez de
// um campo a mais dentro dela.
export type RoomMinimumStayPeriod = {
  label?: string;
  startMonthDay: string;
  endMonthDay: string;
  minStayNights: number;
};

export type RoomClosurePeriod = {
  label?: string;
  startDate: string;
  endDate: string;
  kind?: 'blocked' | 'closed';
};

export type RoomPolicySet = {
  minStayNights?: number | null;
  minStayDays?: number | null;
  seasonalRates?: RoomSeasonalRate[] | null;
  minimumStayPeriods?: RoomMinimumStayPeriod[] | null;
  closurePeriods?: RoomClosurePeriod[] | null;
};

export function parseRoomPolicyArray<T>(input: unknown, mapper: (item: Record<string, unknown>) => T | null): T[] {
  const rawItems = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim().length > 0
      ? (() => {
          try {
            const parsed = JSON.parse(input);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [] as unknown[];
          }
        })()
      : [];

  const items: T[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const mapped = mapper(item as Record<string, unknown>);
    if (mapped) {
      items.push(mapped);
    }
  }

  return items;
}

export function parseMaybeNumber(input: unknown): number | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }

  const value = Number(input);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function toUtcDayKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function differenceInNights(checkIn: string | Date, checkOut: string | Date): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.round((endUtc - startUtc) / 86400000));
}

function toMonthDay(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function monthDayIsWithinRange(monthDay: string, startMonthDay: string, endMonthDay: string) {
  if (!startMonthDay || !endMonthDay) {
    return false;
  }

  if (startMonthDay <= endMonthDay) {
    return monthDay >= startMonthDay && monthDay <= endMonthDay;
  }

  return monthDay >= startMonthDay || monthDay <= endMonthDay;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function monthDayToDayOfYear(monthDay: string): number | null {
  const [month, day] = monthDay.split('-').map(Number);
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  // Ano de referência fixo (não bissexto) só para medir o comprimento do
  // intervalo — os valores absolutos de data não importam aqui.
  return Date.UTC(2001, month - 1, day) / 86400000;
}

function monthDayRangeLength(startMonthDay: string, endMonthDay: string): number {
  const start = monthDayToDayOfYear(startMonthDay);
  const end = monthDayToDayOfYear(endMonthDay);

  if (start === null || end === null) {
    return Number.POSITIVE_INFINITY;
  }

  return end >= start ? end - start : end + 365 - start;
}

// Encontra, entre os períodos (por mês-dia) que cobrem a data informada, o
// mais específico (intervalo mais curto) — em vez de depender da ordem de
// cadastro, como "o primeiro que bater". Reaproveitado tanto pra tarifa
// sazonal quanto pra estadia mínima por período, já que a regra de
// correspondência é idêntica, só muda o que cada lista carrega.
function findMostSpecificPeriod<T extends { startMonthDay: string; endMonthDay: string }>(
  periods: T[] | null | undefined,
  checkIn: string | Date,
): T | null {
  const monthDay = toMonthDay(checkIn);
  if (!monthDay || !Array.isArray(periods)) {
    return null;
  }

  const matches = periods.filter((period) => monthDayIsWithinRange(monthDay, period.startMonthDay, period.endMonthDay));

  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((mostSpecific, candidate) =>
    monthDayRangeLength(candidate.startMonthDay, candidate.endMonthDay) <
    monthDayRangeLength(mostSpecific.startMonthDay, mostSpecific.endMonthDay)
      ? candidate
      : mostSpecific,
  );
}

export function getRoomMinimumStay(room: RoomPolicySet, checkIn: string | Date) {
  const minimumStayPeriod = findMostSpecificPeriod(room.minimumStayPeriods ?? undefined, checkIn);

  return {
    nights: Math.max(
      Number(room.minStayNights ?? 0),
      Number(minimumStayPeriod?.minStayNights ?? 0),
    ),
    days: Number(room.minStayDays ?? 0),
    minimumStayPeriod,
  };
}

export function getRoomEffectivePrice(room: { price: number; seasonalRates?: RoomSeasonalRate[] | null }, checkIn?: string | Date) {
  if (!checkIn) {
    return Number(room.price);
  }

  const seasonalRate = findMostSpecificPeriod(room.seasonalRates ?? undefined, checkIn);
  return seasonalRate ? Number(seasonalRate.price) : Number(room.price);
}

export function findBlockingClosure(
  room: RoomPolicySet,
  checkIn: string | Date,
  checkOut: string | Date,
) {
  const checkInKey = toUtcDayKey(checkIn);
  const checkOutKey = toUtcDayKey(checkOut);

  if (!checkInKey || !checkOutKey || !Array.isArray(room.closurePeriods)) {
    return null;
  }

  return room.closurePeriods.find((period) => {
    const startKey = toUtcDayKey(period.startDate);
    const endKey = toUtcDayKey(period.endDate);
    if (!startKey || !endKey) {
      return false;
    }

    return rangesOverlap(checkInKey, checkOutKey, startKey, endKey);
  }) ?? null;
}
