/**
 * Utilitários de validação e sanitização estrita no backend (Zero-Trust).
 * Nenhuma entrada externa do cliente é aceita sem validação rigorosa.
 */

export function sanitizeString(value: unknown, maxLength = 255): string {
  if (typeof value !== "string") {
    return "";
  }
  // Remove caracteres de controle ASCII perigosos (incluindo null bytes \0)
  const noControl = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Remove tags HTML/scripts (anti-XSS defensivo no backend)
  const noHtml = noControl.replace(/<[^>]*>?/gm, "");
  return noHtml.trim().slice(0, maxLength);
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

export function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 120) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function isValidCpf(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  // Rejeita sequências de dígitos idênticos (00000000000, 11111111111, etc.)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // 1º dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== Number(digits[9])) {
    return false;
  }

  // 2º dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== Number(digits[10])) {
    return false;
  }

  return true;
}

export function isValidPhone(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function isValidDateString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;

  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function isValidReservationCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  return /^[a-zA-Z0-9#_\-]+$/.test(trimmed);
}

export function isValidRoomId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

export function assertAllowedKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
  contextName = "Payload"
): void {
  const forbiddenKeys = [
    "amount",
    "status",
    "role",
    "tenantId",
    "createdByUserId",
    "otaSource",
    "unitNumber",
  ];

  for (const key of Object.keys(body)) {
    if (forbiddenKeys.includes(key)) {
      throw new Error(`Tentativa de injeção de campo restrito: '${key}'.`);
    }
    if (!allowed.includes(key)) {
      throw new Error(`Propriedade desconhecida em ${contextName}: '${key}'.`);
    }
  }
}
