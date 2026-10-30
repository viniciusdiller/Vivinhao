export type { RoomSeasonalRate, RoomMinimumStayPeriod } from '@/lib/room-policies';
import type { RoomClosurePeriod, RoomMinimumStayPeriod, RoomSeasonalRate } from '@/lib/room-policies';

export type OtaSource = 'booking' | 'expedia' | 'hotels_com' | 'manual';

export const BED_TYPES = ['casal', 'solteiro', 'queen', 'king', 'beliche', 'sofa_cama'] as const;
export type BedType = (typeof BED_TYPES)[number];

export const BED_TYPE_LABELS: Record<BedType, string> = {
  casal: 'Cama de casal',
  solteiro: 'Cama de solteiro',
  queen: 'Cama queen',
  king: 'Cama king',
  beliche: 'Beliche',
  sofa_cama: 'Sofá-cama',
};

export type RoomBed = {
  type: BedType;
  quantity: number;
};

export type Room = {
  id: string;
  channexRoomTypeId: string;
  name: string;
  maxGuests: number;
  price: number;
  minStayNights?: number | null;
  minStayDays?: number | null;
  seasonalRates?: RoomSeasonalRate[];
  minimumStayPeriods?: RoomMinimumStayPeriod[];
  closurePeriods?: RoomClosurePeriod[];
  quantity: number;
  status: 'active' | 'maintenance';
  amenities?: string | string[] | null;
  amenitiesList?: string[];
  photoUrls?: string[];
  beds?: RoomBed[];
};

export type ReservationStatus = 'confirmed' | 'pending' | 'cancelled' | 'blocked';

export type Customer = {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
};

export type Reservation = {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  otaSource: OtaSource;
  channelReference: string;
  amount: number;
  currency: string;
  customer: Customer;
  notes: string;
  // Unidade física (1..quantity) do quarto ocupada por esta reserva — usada
  // pelo calendário para desenhar reservas simultâneas do mesmo tipo de
  // quarto em "raias" separadas, em vez de uma sobrepor a outra visualmente.
  unitNumber?: number | null;
};

export type ExpenseCategory = 'limpeza' | 'manutenção' | 'impostos' | 'insumos' | 'comissões' | 'outros';

export type Expense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
};
