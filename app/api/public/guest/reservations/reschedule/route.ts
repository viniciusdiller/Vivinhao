import { handleGuest, guestOptions } from '@/lib/guest-api';
export const runtime = 'nodejs';
export const OPTIONS = guestOptions;
export async function POST(request: Request) { return handleGuest(request, 'reschedule'); }
