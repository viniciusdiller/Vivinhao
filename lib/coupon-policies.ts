// Período de validade do cupom é sobre a DATA DA RESERVA (check-in), não
// sobre quando o cupom é digitado no checkout — um cupom lançado pra
// setembro não pode valer pra uma reserva de Réveillon fechada em setembro.
export type CouponValidityPeriod = {
  validFrom: string | null;
  validUntil: string | null;
};

function toDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

/**
 * Verifica se a data de check-in cai dentro do período de validade do
 * cupom. `validFrom`/`validUntil` nulos são lados abertos (sem restrição
 * naquela ponta) — um cupom sem nenhuma das duas datas vale para qualquer
 * período.
 */
export function isCouponValidForCheckIn(
  coupon: CouponValidityPeriod,
  checkIn: string | Date,
): boolean {
  const checkInKey = toDateKey(checkIn);

  if (coupon.validFrom && checkInKey < coupon.validFrom.slice(0, 10)) {
    return false;
  }

  if (coupon.validUntil && checkInKey > coupon.validUntil.slice(0, 10)) {
    return false;
  }

  return true;
}
