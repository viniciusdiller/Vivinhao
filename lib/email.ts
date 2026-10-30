// Resend HTTP API: no SDK or schema migration is needed.
export type BookingEmail = {
  reservationCode: string; guestName: string; guestEmail: string;
  roomName: string; checkIn: string; checkOut: string; amount: number;
};
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
export function buildBookingConfirmationEmail(input: BookingEmail) {
  const subject = `Reserva confirmada • ${input.reservationCode} — Pousada Viva Mar`;
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(input.amount);
  const site = process.env.GUEST_PORTAL_URL || '';
  const url = /^https:\/\//.test(site) ? site : '';
  const text = `POUSADA VIVA MAR\n\nOlá, ${input.guestName}!\nSua reserva está confirmada.\n\nCódigo: ${input.reservationCode}\nAcomodação: ${input.roomName}\nCheck-in: ${input.checkIn}\nCheck-out: ${input.checkOut}\nValor da hospedagem: ${amount}\n\nConsulte seu voucher em “Minhas reservas” no site da pousada, informando o código e seu CPF ou e-mail.${url ? `\n${url}` : ''}\n\nDúvidas: pousadavivamarsaqua@gmail.com`;
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="background:#f1f6fc;font-family:Arial,sans-serif;color:#172c45;padding:24px"><main style="max-width:600px;margin:auto;background:white;padding:32px;border-radius:12px"><h1 style="color:#1b4fb8">Pousada Viva Mar</h1><h2>Reserva confirmada</h2><p>Olá, ${escapeHtml(input.guestName)}!</p><p>Estamos esperando você.</p><p><strong>Código: ${escapeHtml(input.reservationCode)}</strong></p><table cellpadding="10"><tr><td>Acomodação</td><td>${escapeHtml(input.roomName)}</td></tr><tr><td>Check-in</td><td>${escapeHtml(input.checkIn)}</td></tr><tr><td>Check-out</td><td>${escapeHtml(input.checkOut)}</td></tr><tr><td>Hospedagem</td><td>${escapeHtml(amount)}</td></tr></table><p>Consulte seu voucher em <strong>Minhas reservas</strong>, com o código e seu CPF ou e-mail.</p>${url ? `<p><a href="${escapeHtml(url)}">Acessar o site da pousada</a></p>` : ''}<p>pousadavivamarsaqua@gmail.com</p></main></body></html>`;
  return { subject, text, html };
}
export async function sendBookingEmail(input: BookingEmail, eventKey: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn('E-mail de reserva não enviado: configure RESEND_API_KEY e EMAIL_FROM.');
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': eventKey },
      body: JSON.stringify({ from, to: [input.guestEmail], ...buildBookingConfirmationEmail(input) }),
    });
    if (!response.ok) console.warn('Falha no envio do voucher; status:', response.status);
    return response.ok;
  } catch {
    console.warn('Falha na comunicação com o serviço de e-mail.');
    return false;
  } finally { clearTimeout(timer); }
}
