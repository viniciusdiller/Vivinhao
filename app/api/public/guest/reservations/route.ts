import { handleGuest, guestOptions } from '@/lib/guest-api';
export const runtime = 'nodejs';
export const OPTIONS = guestOptions;
export async function GET(request: Request) { return handleGuest(request, 'list'); }
