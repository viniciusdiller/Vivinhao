'use client';

import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';

import { BedDouble, Settings2, Plus, Trash2, CircleDollarSign, Save, X, Edit2, LockOpen } from 'lucide-react';

import { useToast } from '@/components/toast-provider';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils';
import type { RoomClosurePeriod, RoomSeasonalRate } from '@/lib/room-policies';
import { BED_TYPES, BED_TYPE_LABELS, type BedType, type RoomBed } from '@/types/domain';

type RoomOperationalStatus = 'vacant' | 'cleaning' | 'awaiting_guest' | 'maintenance' | 'occupied';

type RoomSnapshot = {
  id: string;
  room: string;
  category: string;
  status: RoomOperationalStatus;
  updatedAt: string;
  note: string;
  // Só vem preenchido quando "Manutenção" é um fechamento operacional real
  // (reserva bloqueada) — nesse caso o seletor de status não adianta (a
  // apuração real sempre prevalece), então a UI oferece "Reabrir quarto".
  blockingReservationId?: string | null;
};

type RoomData = {
  id: string;
  name: string;
  price: number;
  minStayNights?: number | null;
  minStayDays?: number | null;
  seasonalRates?: RoomSeasonalRate[];
  closurePeriods?: RoomClosurePeriod[];
  beds?: RoomBed[];
  quantity: number;
  maxGuests: number;
  status: 'active' | 'maintenance';
  amenities?: string | string[] | null;
  amenitiesList?: string[];
  photoUrls?: string[];
};

const MAX_PHOTOS_PER_ROOM = 8;

function getSnapshotUnitNumber(snapshotId: string) {
  const lastUnderscore = snapshotId.lastIndexOf('_');
  if (lastUnderscore === -1) return 1;

  const unitNumber = Number.parseInt(snapshotId.slice(lastUnderscore + 1), 10);
  return Number.isInteger(unitNumber) && unitNumber > 0 ? unitNumber : 1;
}

function getSnapshotGroupKey(snapshotId: string) {
  const lastUnderscore = snapshotId.lastIndexOf('_');
  return lastUnderscore === -1 ? snapshotId : snapshotId.slice(0, lastUnderscore);
}

function roomStatusBadge(status: RoomOperationalStatus) {
  if (status === 'vacant') {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25';
  }

  if (status === 'cleaning') {
    return 'bg-amber-500/10 text-amber-200 border-amber-400/30';
  }

  if (status === 'awaiting_guest') {
    return 'bg-sky-500/10 text-sky-200 border-sky-400/30';
  }

  if (status === 'maintenance') {
    return 'bg-rose-500/10 text-rose-200 border-rose-400/30';
  }

  return 'bg-indigo-500/10 text-indigo-200 border-indigo-400/30';
}

function roomStatusLabel(status: RoomOperationalStatus) {
  if (status === 'vacant') {
    return 'Vaga';
  }

  if (status === 'cleaning') {
    return 'Limpando';
  }

  if (status === 'awaiting_guest') {
    return 'Esperando hóspede';
  }

  if (status === 'maintenance') {
    return 'Manutenção';
  }

  return 'Ocupado';
}

export default function RoomsPage() {
  const { showToast } = useToast();
  const createPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [snapshots, setSnapshots] = useState<RoomSnapshot[]>([]);
  const [selectedSnapshotByGroup, setSelectedSnapshotByGroup] = useState<Record<string, string>>({});
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingQuantities, setEditingQuantities] = useState<Record<string, string>>({});
  const [amenitiesTab, setAmenitiesTab] = useState<'preset' | 'custom'>('preset');
  const [editAmenitiesTab, setEditAmenitiesTab] = useState<'preset' | 'custom'>('preset');
  const [roomBeingEdited, setRoomBeingEdited] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    price: '',
    minStayNights: '',
    minStayDays: '',
    quantity: '1',
    maxGuests: '2',
    selectedAmenities: [] as string[],
    customAmenities: '',
    seasonalRatesJson: '[]',
    closurePeriodsJson: '[]',
    beds: [] as RoomBed[],
    photoFiles: [] as File[],
  });
  const [editRoom, setEditRoom] = useState({
    name: '',
    price: '',
    minStayNights: '',
    minStayDays: '',
    quantity: '1',
    maxGuests: '2',
    selectedAmenities: [] as string[],
    customAmenities: '',
    seasonalRatesJson: '[]',
    closurePeriodsJson: '[]',
    beds: [] as RoomBed[],
    existingPhotoUrls: [] as string[],
    newPhotoFiles: [] as File[],
  });

  const PRESET_AMENITIES = [
    'WiFi',
    'Ar Condicionado',
    'TV Tela Plana',
    'Minibar',
    'Cofre',
    'Frigobar',
    'Chaleira Elétrica',
    'Secador de Cabelo',
    'Amenities de Banho',
    'Roupão de Banho',
    'Cama Premium',
    'Trabalho de Mesas',
    'Serviço de Quarto',
    'Limpeza Diária',
  ];

  const normalizeAmenity = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const PRESET_AMENITIES_MAP = new Map(
    PRESET_AMENITIES.map((amenity) => [normalizeAmenity(amenity), amenity]),
  );

  const getBedQuantity = (beds: RoomBed[], type: BedType) =>
    beds.find((bed) => bed.type === type)?.quantity ?? 0;

  const setBedQuantity = (beds: RoomBed[], type: BedType, quantity: number): RoomBed[] => {
    const withoutType = beds.filter((bed) => bed.type !== type);
    return quantity > 0 ? [...withoutType, { type, quantity }] : withoutType;
  };

  const parseStringArray = (input: unknown) => {
    if (Array.isArray(input)) {
      return input
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
    }

    if (typeof input !== 'string' || input.trim().length === 0) {
      return [] as string[];
    }

    try {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) {
        return [] as string[];
      }

      return parsed
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
    } catch {
      return input
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  };

  const parseJsonArray = <T,>(input: string) => {
    if (!input.trim()) return [] as T[];

    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  };

  const selectCreatePhotos = (files: FileList | null) => {
    if (!files) return;

    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const availableSlots = MAX_PHOTOS_PER_ROOM - newRoom.photoFiles.length;
    const accepted = incoming.slice(0, Math.max(availableSlots, 0));

    if (accepted.length < incoming.length) {
      showToast(`Limite de ${MAX_PHOTOS_PER_ROOM} fotos por quarto`);
    }

    setNewRoom((prev) => ({
      ...prev,
      photoFiles: [...prev.photoFiles, ...accepted],
    }));

    if (createPhotoInputRef.current) {
      createPhotoInputRef.current.value = '';
    }
  };

  const selectEditPhotos = (files: FileList | null) => {
    if (!files) return;

    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const usedSlots = editRoom.existingPhotoUrls.length + editRoom.newPhotoFiles.length;
    const availableSlots = MAX_PHOTOS_PER_ROOM - usedSlots;
    const accepted = incoming.slice(0, Math.max(availableSlots, 0));

    if (accepted.length < incoming.length) {
      showToast(`Limite de ${MAX_PHOTOS_PER_ROOM} fotos por quarto`);
    }

    setEditRoom((prev) => ({
      ...prev,
      newPhotoFiles: [...prev.newPhotoFiles, ...accepted],
    }));

    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = '';
    }
  };

  const removeCreatePhoto = (index: number) => {
    setNewRoom((prev) => ({
      ...prev,
      photoFiles: prev.photoFiles.filter((_, i) => i !== index),
    }));
  };

  const removeExistingEditPhoto = (index: number) => {
    setEditRoom((prev) => ({
      ...prev,
      existingPhotoUrls: prev.existingPhotoUrls.filter((_, i) => i !== index),
    }));
  };

  const removeNewEditPhoto = (index: number) => {
    setEditRoom((prev) => ({
      ...prev,
      newPhotoFiles: prev.newPhotoFiles.filter((_, i) => i !== index),
    }));
  };

  const uploadRoomPhotos = async (files: File[], roomName: string) => {
    if (files.length === 0) {
      return [] as string[];
    }

    const normalizedRoomName = roomName.trim();
    if (!normalizedRoomName) {
      throw new Error('Nome do quarto é obrigatório para enviar fotos');
    }

    const formData = new FormData();
    formData.append('roomName', normalizedRoomName);
    for (const file of files) {
      formData.append('photos', file);
    }

    const response = await fetch('/api/tenant/rooms/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha no upload das fotos');
    }

    return Array.isArray(payload.urls) ? payload.urls : [];
  };

  const toggleAmenity = (amenity: string) => {
    setNewRoom((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter((a) => a !== amenity)
        : [...prev.selectedAmenities, amenity],
    }));
  };

  const toggleAmenityEdit = (amenity: string) => {
    setEditRoom((prev) => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter((a) => a !== amenity)
        : [...prev.selectedAmenities, amenity],
    }));
  };

  const openEditModal = (room: RoomData) => {
    const parsedAmenities =
      Array.isArray(room.amenitiesList) && room.amenitiesList.length > 0
        ? room.amenitiesList
        : parseStringArray(room.amenities);
    const parsedPhotoUrls = Array.isArray(room.photoUrls) ? room.photoUrls : [];

    const selectedAmenities = Array.from(
      new Set(
        parsedAmenities
          .map((amenity) => PRESET_AMENITIES_MAP.get(normalizeAmenity(amenity)))
          .filter((amenity): amenity is string => Boolean(amenity)),
      ),
    );

    const customAmenities = Array.from(
      new Set(
        parsedAmenities.filter(
          (amenity) => !PRESET_AMENITIES_MAP.has(normalizeAmenity(amenity)),
        ),
      ),
    ).join(', ');

    setEditRoom({
      name: room.name,
      price: formatCurrencyInput(String(Math.round(room.price * 100))),
      minStayNights: room.minStayNights?.toString() ?? '',
      minStayDays: room.minStayDays?.toString() ?? '',
      quantity: room.quantity.toString(),
      maxGuests: room.maxGuests.toString(),
      selectedAmenities,
      customAmenities,
      existingPhotoUrls: parsedPhotoUrls,
      seasonalRatesJson: JSON.stringify(room.seasonalRates ?? [], null, 2),
      closurePeriodsJson: JSON.stringify(room.closurePeriods ?? [], null, 2),
      beds: Array.isArray(room.beds) ? room.beds : [],
      newPhotoFiles: [],
    });
    setRoomBeingEdited(room.id);
    setEditAmenitiesTab('preset');
    setIsEditModalOpen(true);
  };

  const handleUpdateRoom = async (e: FormEvent) => {
    e.preventDefault();

    if (isUpdatingRoom) {
      return;
    }

    if (!editRoom.name.trim()) {
      showToast('Nome do quarto é obrigatório');
      return;
    }

    if (!roomBeingEdited) {
      showToast('Erro ao atualizar quarto');
      return;
    }

    const price = parseCurrencyInput(editRoom.price);
    const minStayNights = editRoom.minStayNights ? parseInt(editRoom.minStayNights, 10) : null;
    const minStayDays = editRoom.minStayDays ? parseInt(editRoom.minStayDays, 10) : null;
    const quantity = parseInt(editRoom.quantity, 10);
    const maxGuests = parseInt(editRoom.maxGuests, 10);

    if (!Number.isFinite(price) || price < 0) {
      showToast('Preço inválido');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      showToast('Quantidade deve ser um número inteiro maior que zero');
      return;
    }

    if (!Number.isInteger(maxGuests) || maxGuests < 1) {
      showToast('Capacidade deve ser um número inteiro maior que zero');
      return;
    }

    let seasonalRates: RoomSeasonalRate[] = [];
    let closurePeriods: RoomClosurePeriod[] = [];

    try {
      seasonalRates = parseJsonArray<RoomSeasonalRate>(editRoom.seasonalRatesJson);
      closurePeriods = parseJsonArray<RoomClosurePeriod>(editRoom.closurePeriodsJson);
    } catch {
      showToast('As regras sazonais e os bloqueios precisam estar em JSON válido');
      return;
    }

    setIsUpdatingRoom(true);
    try {
      let uploadedPhotoUrls: string[] = [];
      try {
        uploadedPhotoUrls = await uploadRoomPhotos(editRoom.newPhotoFiles, editRoom.name);
      } catch (error: any) {
        showToast(error?.message || 'Erro ao enviar fotos');
        return;
      }

      const res = await fetch(`/api/tenant/rooms/${roomBeingEdited}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editRoom.name.trim(),
          price,
          minStayNights,
          minStayDays,
          quantity,
          maxGuests,
          amenities: [
            ...editRoom.selectedAmenities,
            ...(editRoom.customAmenities
              .split(',')
              .map((a) => a.trim())
              .filter((a) => a)),
          ],
          photoUrls: [...editRoom.existingPhotoUrls, ...uploadedPhotoUrls],
          seasonalRates,
          closurePeriods,
          beds: editRoom.beds,
        }),
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        setRoomBeingEdited(null);
        fetchRooms();
        showToast('Quarto atualizado com sucesso!');
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível atualizar'}`);
      }
    } catch (error) {
      showToast('Erro de conexão ao atualizar quarto');
    } finally {
      setIsUpdatingRoom(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    fetchSnapshots();
  }, []);

  async function fetchSnapshots() {
    setLoadingSnapshots(true);
    try {
      const res = await fetch('/api/tenant/rooms/panel');
      const data = await res.json();
      if (data.snapshots) setSnapshots(data.snapshots);
    } catch (error) {
      console.error('Erro ao carregar painel de quartos:', error);
      showToast('Erro ao carregar painel de quartos');
    } finally {
      setLoadingSnapshots(false);
    }
  }

  async function fetchRooms() {
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/inventory');
      const data = await res.json();
      if (data.rooms) setRooms(data.rooms);
    } catch (error) {
      console.error('Erro ao carregar quartos:', error);
      showToast('Erro ao carregar quartos');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: RoomOperationalStatus) {
    const now = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    const previousSnapshot = snapshots.find((room) => room.id === id);
    setSnapshots((prev) => prev.map((room) => (room.id === id ? { ...room, status, updatedAt: now } : room)));
    try {
      const res = await fetch(`/api/tenant/rooms/panel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error('Falha ao salvar status');
      }
    } catch {
      if (previousSnapshot) {
        setSnapshots((prev) => prev.map((room) => (room.id === id ? previousSnapshot : room)));
      }
      showToast('Erro ao salvar status. Alteração revertida.');
    }
  }

  const [reopeningUnitId, setReopeningUnitId] = useState<string | null>(null);

  // Quando "Manutenção" vem de um fechamento operacional real (reserva
  // bloqueada, ex.: criado em "Fechar quarto" no Calendário de gestão), o
  // seletor de status não resolve — a apuração real sempre prevalece sobre
  // o override manual. Só remover a reserva bloqueada libera a unidade.
  async function reopenBlockedUnit(snapshotId: string, reservationId: string) {
    setReopeningUnitId(snapshotId);
    try {
      const res = await fetch('/api/tenant/reservations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Falha ao reabrir o quarto');
      }

      showToast('Quarto reaberto com sucesso.');
      await fetchSnapshots();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao reabrir o quarto.');
    } finally {
      setReopeningUnitId(null);
    }
  }

  const handlePriceChange = (roomId: string, value: string) => {
    setEditingPrices((prev) => ({ ...prev, [roomId]: formatCurrencyInput(value) }));
  };

  const savePriceChange = async (roomId: string) => {
    const newPrice = editingPrices[roomId];
    if (!newPrice) return;

    try {
      const res = await fetch(`/api/tenant/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: parseCurrencyInput(newPrice) }),
      });

      if (res.ok) {
        showToast('Preço atualizado com sucesso!');
        fetchRooms();
        setEditingPrices((prev) => {
          const newState = { ...prev };
          delete newState[roomId];
          return newState;
        });
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível atualizar'}`);
      }
    } catch (error) {
      showToast('Erro de conexão ao atualizar preço');
    }
  };

  const handleQuantityChange = (roomId: string, value: string) => {
    setEditingQuantities((prev) => ({ ...prev, [roomId]: value }));
  };

  const saveQuantityChange = async (roomId: string) => {
    const newQuantity = editingQuantities[roomId];
    if (!newQuantity) return;

    const qty = parseInt(newQuantity, 10);
    if (!Number.isInteger(qty) || qty < 1) {
      showToast('Quantidade deve ser um número inteiro maior que zero');
      return;
    }

    try {
      const res = await fetch(`/api/tenant/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      });

      if (res.ok) {
        showToast('Quantidade atualizada com sucesso!');
        fetchRooms();
        setEditingQuantities((prev) => {
          const newState = { ...prev };
          delete newState[roomId];
          return newState;
        });
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível atualizar'}`);
      }
    } catch (error) {
      showToast('Erro de conexão ao atualizar quantidade');
    }
  };

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();

    if (isCreatingRoom) {
      return;
    }

    if (!newRoom.name.trim()) {
      showToast('Nome do quarto é obrigatório');
      return;
    }

    const price = parseCurrencyInput(newRoom.price);
    const minStayNights = newRoom.minStayNights ? parseInt(newRoom.minStayNights, 10) : null;
    const minStayDays = newRoom.minStayDays ? parseInt(newRoom.minStayDays, 10) : null;
    const quantity = parseInt(newRoom.quantity, 10);
    const maxGuests = parseInt(newRoom.maxGuests, 10);

    if (!Number.isFinite(price) || price < 0) {
      showToast('Preço inválido');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      showToast('Quantidade deve ser um número inteiro maior que zero');
      return;
    }

    if (!Number.isInteger(maxGuests) || maxGuests < 1) {
      showToast('Capacidade deve ser um número inteiro maior que zero');
      return;
    }

    let seasonalRates: RoomSeasonalRate[] = [];
    let closurePeriods: RoomClosurePeriod[] = [];

    try {
      seasonalRates = parseJsonArray<RoomSeasonalRate>(newRoom.seasonalRatesJson);
      closurePeriods = parseJsonArray<RoomClosurePeriod>(newRoom.closurePeriodsJson);
    } catch {
      showToast('As regras sazonais e os bloqueios precisam estar em JSON válido');
      return;
    }

    setIsCreatingRoom(true);
    try {
      let uploadedPhotoUrls: string[] = [];
      try {
        uploadedPhotoUrls = await uploadRoomPhotos(newRoom.photoFiles, newRoom.name);
      } catch (error: any) {
        showToast(error?.message || 'Erro ao enviar fotos');
        return;
      }

      const res = await fetch('/api/tenant/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoom.name.trim(),
          price,
          minStayNights,
          minStayDays,
          quantity,
          maxGuests,
          amenities: [
            ...newRoom.selectedAmenities,
            ...(newRoom.customAmenities
              .split(',')
              .map((a) => a.trim())
              .filter((a) => a)),
          ],
          photoUrls: uploadedPhotoUrls,
          seasonalRates,
          closurePeriods,
          beds: newRoom.beds,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewRoom({
          name: '',
          price: '',
          minStayNights: '',
          minStayDays: '',
          quantity: '1',
          maxGuests: '2',
          selectedAmenities: [],
          customAmenities: '',
          seasonalRatesJson: '[]',
          closurePeriodsJson: '[]',
          beds: [],
          photoFiles: [],
        });
        fetchRooms();
        showToast('Quarto criado com sucesso!');
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível criar'}`);
      }
    } catch (error) {
      showToast('Erro de conexão ao criar quarto');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const deleteRoom = (roomId: string) => {
    setRoomToDelete(roomId);
  };

  const handleRoomDeleteConfirm = async () => {
    if (!roomToDelete) return;
    setIsDeletingRoom(true);
    try {
      const res = await fetch(`/api/tenant/rooms/${roomToDelete}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast('Quarto removido com sucesso!');
        setRoomToDelete(null);
        fetchRooms();
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível remover'}`);
      }
    } catch (error) {
      showToast('Erro de conexão ao remover quarto');
    } finally {
      setIsDeletingRoom(false);
    }
  };

  const totals = {
    vacant: snapshots.filter((room) => room.status === 'vacant').length,
    cleaning: snapshots.filter((room) => room.status === 'cleaning').length,
    awaitingGuest: snapshots.filter((room) => room.status === 'awaiting_guest').length,
    maintenance: snapshots.filter((room) => room.status === 'maintenance').length,
    occupied: snapshots.filter((room) => room.status === 'occupied').length,
  };

  const groupedSnapshots = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; category: string; snapshots: RoomSnapshot[] }
    >();

    for (const snapshot of snapshots) {
      const key = getSnapshotGroupKey(snapshot.id);
      const current = groups.get(key);

      if (current) {
        current.snapshots.push(snapshot);
      } else {
        groups.set(key, {
          key,
          category: snapshot.category,
          snapshots: [snapshot],
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        snapshots: [...group.snapshots].sort(
          (a, b) => getSnapshotUnitNumber(a.id) - getSnapshotUnitNumber(b.id),
        ),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));
  }, [snapshots]);

  useEffect(() => {
    setSelectedSnapshotByGroup((prev) => {
      const next: Record<string, string> = {};
      let hasChanges = false;

      for (const group of groupedSnapshots) {
        const previousSelection = prev[group.key];
        const isSelectionValid = group.snapshots.some((snapshot) => snapshot.id === previousSelection);
        next[group.key] = isSelectionValid ? previousSelection : group.snapshots[0]?.id ?? '';
        if (next[group.key] !== previousSelection) {
          hasChanges = true;
        }
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        hasChanges = true;
      }

      return hasChanges ? next : prev;
    });
  }, [groupedSnapshots]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Governança operacional</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Painel de quartos</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Gerencie seus quartos: visualize status operacional, configure preços, quantidade de unidades e crie novos quartos.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            Ideal para troca rápida de turno.
          </div>
        </div>
      </section>

      {/* STATUS TOTALS */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Vaga</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-100">{totals.vacant}</p>
        </article>
        <article className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Limpando</p>
          <p className="mt-2 text-2xl font-semibold text-amber-100">{totals.cleaning}</p>
        </article>
        <article className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Esperando hóspede</p>
          <p className="mt-2 text-2xl font-semibold text-sky-100">{totals.awaitingGuest}</p>
        </article>
        <article className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Manutenção</p>
          <p className="mt-2 text-2xl font-semibold text-rose-100">{totals.maintenance}</p>
        </article>
        <article className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Ocupado</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-100">{totals.occupied}</p>
        </article>
      </section>

      {/* OPERATIONAL STATUS */}
      <section className="grid gap-3 lg:grid-cols-2">
        {loadingSnapshots ? (
          <p className="col-span-2 text-slate-400">Carregando quartos...</p>
        ) : snapshots.length === 0 ? (
          <p className="col-span-2 text-sm text-slate-400 text-center py-6 border border-dashed border-white/10 rounded-2xl">
            Nenhum quarto cadastrado. Crie um novo na seção abaixo.
          </p>
        ) : null}
        {groupedSnapshots.map((group) => {
          const selectedSnapshotId = selectedSnapshotByGroup[group.key] ?? group.snapshots[0]?.id;
          const selectedSnapshot = group.snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? group.snapshots[0];

          if (!selectedSnapshot) {
            return null;
          }

          return (
            <article key={group.key} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-sky-300" />
                <div>
                  <p className="font-medium text-white">{group.category}</p>
                  <p className="text-xs text-slate-400">Unidade {getSnapshotUnitNumber(selectedSnapshot.id)}</p>
                </div>
              </div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${roomStatusBadge(selectedSnapshot.status)}`}>
                {roomStatusLabel(selectedSnapshot.status)}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">{selectedSnapshot.note}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Settings2 className="h-3.5 w-3.5" /> Atualizado: {selectedSnapshot.updatedAt}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSnapshot.id}
                  onChange={(e) =>
                    setSelectedSnapshotByGroup((prev) => ({
                      ...prev,
                      [group.key]: e.target.value,
                    }))
                  }
                  className="cursor-pointer rounded-xl border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 outline-none ring-sky-300 transition focus:ring"
                >
                  {group.snapshots.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      Quarto {getSnapshotUnitNumber(snapshot.id)}
                    </option>
                  ))}
                </select>
                {selectedSnapshot.blockingReservationId ? (
                  <button
                    onClick={() =>
                      reopenBlockedUnit(selectedSnapshot.id, selectedSnapshot.blockingReservationId as string)
                    }
                    disabled={reopeningUnitId === selectedSnapshot.id}
                    title="Remove o fechamento operacional que está travando esta unidade"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LockOpen className="h-3.5 w-3.5" />
                    {reopeningUnitId === selectedSnapshot.id ? 'Reabrindo...' : 'Reabrir quarto'}
                  </button>
                ) : (
                  <select
                    value={selectedSnapshot.status}
                    onChange={(e) => updateStatus(selectedSnapshot.id, e.target.value as RoomOperationalStatus)}
                    className="cursor-pointer rounded-xl border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 outline-none ring-sky-300 transition focus:ring"
                  >
                    <option value="vacant">Vaga</option>
                    <option value="cleaning">Limpando</option>
                    <option value="awaiting_guest">Esperando hóspede</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="occupied">Ocupado</option>
                  </select>
                )}
              </div>
            </div>
          </article>
          );
        })}
      </section>

      {/* PRICING & INVENTORY MANAGEMENT */}
      <section className="rounded-[30px] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
              <CircleDollarSign className="h-5 w-5 text-sky-300" />
            </div>
            <h3 className="text-xl font-semibold text-white">
              Gestão de Preços e Inventário
            </h3>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            <Plus className="h-4 w-4" /> Novo Quarto
          </button>
        </div>

        {loading ? (
          <p className="text-slate-400">Carregando quartos...</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-white/10 rounded-2xl">
            Nenhum quarto configurado. Crie um novo para começar.
          </p>
        ) : (
          <div className="space-y-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition-all hover:border-white/20"
              >
                <div className="flex flex-1 items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    {room.photoUrls?.[0] ? (
                      <img
                        src={room.photoUrls[0]}
                        alt={`Foto do quarto ${room.name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-slate-500">
                        Sem foto
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                  <p className="font-semibold text-slate-200">{room.name}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">
                    Até {room.maxGuests} {room.maxGuests === 1 ? 'hóspede' : 'hóspedes'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      Mín. noites: {room.minStayNights ?? '-'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      Mín. dias: {room.minStayDays ?? '-'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      Tarifas: {room.seasonalRates?.length ?? 0}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      Bloqueios: {room.closurePeriods?.length ?? 0}
                    </span>
                    {room.beds && room.beds.length > 0 && (
                      <span className="rounded-full border border-white/10 px-2 py-1">
                        Camas: {room.beds.map((bed) => `${bed.quantity}x ${BED_TYPE_LABELS[bed.type]}`).join(', ')}
                      </span>
                    )}
                  </div>
                  </div>
                </div>

                {/* Preço */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={formatCurrencyInput(String(Math.round(room.price * 100)))}
                      value={editingPrices[room.id] ?? ''}
                      onChange={(e) => handlePriceChange(room.id, e.target.value)}
                      className="w-28 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                    />
                    {editingPrices[room.id] && (
                      <button
                        onClick={() => savePriceChange(room.id)}
                        className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                        title="Salvar Novo Preço"
                      >
                        <Save className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Quantidade */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm font-medium">Qtd:</span>
                    <input
                      type="number"
                      placeholder={String(room.quantity)}
                      value={editingQuantities[room.id] ?? ''}
                      onChange={(e) => handleQuantityChange(room.id, e.target.value)}
                      className="w-20 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                      min="1"
                    />
                    {editingQuantities[room.id] && (
                      <button
                        onClick={() => saveQuantityChange(room.id)}
                        className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                        title="Salvar Nova Quantidade"
                      >
                        <Save className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Edit */}
                  <button
                    onClick={() => openEditModal(room)}
                    className="rounded-xl border border-white/10 bg-slate-900 p-2 text-blue-400 transition hover:bg-blue-400/10"
                    title="Editar Quarto"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="rounded-xl border border-white/10 bg-slate-900 p-2 text-rose-400 transition hover:bg-rose-400/10"
                    title="Remover Quarto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL DE NOVO QUARTO */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="my-2 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-semibold text-white">
                    Criar Quarto
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Configure um novo quarto para sua pousada.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white bg-slate-950/50 p-2 rounded-xl"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="flex-1 space-y-4 overflow-y-auto pr-1">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">
                    Nome do Quarto
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Suíte Atlântico"
                    value={newRoom.name}
                    onChange={(e) =>
                      setNewRoom({ ...newRoom, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Preço Diário (R$)
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="R$ 0,00"
                      value={newRoom.price}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setNewRoom({ ...newRoom, price: formatCurrencyInput(e.target.value) });
                      }}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Mínimo de noites
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newRoom.minStayNights}
                      onChange={(e) => setNewRoom({ ...newRoom, minStayNights: e.target.value })}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Quantidade
                    </span>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="1"
                      value={newRoom.quantity}
                      onChange={(e) =>
                        setNewRoom({ ...newRoom, quantity: e.target.value })
                      }
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Mínimo de dias
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newRoom.minStayDays}
                      onChange={(e) => setNewRoom({ ...newRoom, minStayDays: e.target.value })}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">
                    Capacidade Máxima (hóspedes)
                  </span>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="2"
                    value={newRoom.maxGuests}
                    onChange={(e) =>
                      setNewRoom({ ...newRoom, maxGuests: e.target.value })
                    }
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Camas</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {BED_TYPES.map((bedType) => {
                      const quantity = getBedQuantity(newRoom.beds, bedType);
                      return (
                        <div
                          key={bedType}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5"
                        >
                          <span className="text-sm text-slate-200">{BED_TYPE_LABELS[bedType]}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setNewRoom({
                                  ...newRoom,
                                  beds: setBedQuantity(newRoom.beds, bedType, Math.max(0, quantity - 1)),
                                })
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
                            >
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-semibold text-white">{quantity}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setNewRoom({
                                  ...newRoom,
                                  beds: setBedQuantity(newRoom.beds, bedType, quantity + 1),
                                })
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">
                    Fotos do Quarto
                  </span>
                  <input
                    ref={createPhotoInputRef}
                    id="create-room-photo-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => selectCreatePhotos(e.target.files)}
                    className="sr-only"
                  />
                  <label
                    htmlFor="create-room-photo-upload"
                    className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-sky-400/40 bg-slate-950/60 px-4 py-3 text-sm font-medium text-sky-200 transition hover:border-sky-300 hover:bg-sky-500/10"
                  >
                    Escolher fotos do computador
                  </label>
                  <p className="text-xs text-slate-500">
                    Formatos aceitos: JPG, PNG, WEBP e GIF. Ate 5MB por arquivo.
                  </p>
                </div>

                {newRoom.photoFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">
                      Fotos selecionadas ({newRoom.photoFiles.length}/{MAX_PHOTOS_PER_ROOM}):
                    </p>
                    <div className="space-y-2">
                      {newRoom.photoFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                          <span className="min-w-0 flex-1 truncate pr-3 text-xs text-slate-200">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeCreatePhoto(index)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* COMODIDADES */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <p className="text-sm font-medium text-slate-200">Comodidades</p>
                  
                  {/* TABS */}
                  <div className="flex gap-2 border-b border-white/10">
                    <button
                      type="button"
                      onClick={() => setAmenitiesTab('preset')}
                      className={`px-3 py-2 text-xs font-semibold transition ${
                        amenitiesTab === 'preset'
                          ? 'border-b-2 border-sky-400 text-sky-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Pré-selecionadas
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmenitiesTab('custom')}
                      className={`px-3 py-2 text-xs font-semibold transition ${
                        amenitiesTab === 'custom'
                          ? 'border-b-2 border-sky-400 text-sky-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Customizadas
                    </button>
                  </div>

                  {/* PRESET AMENITIES */}
                  {amenitiesTab === 'preset' && (
                    <div className="space-y-3 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {PRESET_AMENITIES.map((amenity) => (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleAmenity(amenity)}
                            className={`rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${
                              newRoom.selectedAmenities.includes(amenity)
                                ? 'border-sky-400 bg-sky-400/20 text-sky-300'
                                : 'border-white/10 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            {amenity}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CUSTOM AMENITIES */}
                  {amenitiesTab === 'custom' && (
                    <div className="space-y-3 pt-3">
                      <input
                        type="text"
                        placeholder="Separe por vírgula (ex: Churrasqueira, Piscina)"
                        value={newRoom.customAmenities}
                        onChange={(e) =>
                          setNewRoom({
                            ...newRoom,
                            customAmenities: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                      />
                      <div className="space-y-2 pt-2">
                        <p className="text-xs text-slate-400">Comodidades selecionadas:</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ...newRoom.selectedAmenities,
                            ...(newRoom.customAmenities
                              .split(',')
                              .map((a) => a.trim())
                              .filter((a) => a)),
                          ].map((amenity) => (
                            <span
                              key={amenity}
                              className="inline-block rounded-lg bg-sky-400/20 px-2.5 py-1.5 text-xs text-sky-300 font-medium"
                            >
                              {amenity}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="sticky bottom-0 z-10 flex gap-3 border-t border-white/10 bg-slate-900 pt-4">
                  <button
                    type="submit"
                    disabled={isCreatingRoom}
                    className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingRoom ? 'Criando...' : 'Criar Quarto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isCreatingRoom}
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE EDIÇÃO DE QUARTO */}
      <AnimatePresence>
        {isEditModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="my-2 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-semibold text-white">
                    Editar Quarto
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Atualize as informações do quarto.
                  </p>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white bg-slate-950/50 p-2 rounded-xl"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateRoom} className="flex-1 space-y-4 overflow-y-auto pr-1">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">
                    Nome do Quarto
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Suíte Atlântico"
                    value={editRoom.name}
                    onChange={(e) =>
                      setEditRoom({ ...editRoom, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Preço Diário (R$)
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="R$ 0,00"
                      value={editRoom.price}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setEditRoom({ ...editRoom, price: formatCurrencyInput(e.target.value) });
                      }}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Mínimo de noites
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editRoom.minStayNights}
                      onChange={(e) => setEditRoom({ ...editRoom, minStayNights: e.target.value })}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Quantidade
                    </span>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="1"
                      value={editRoom.quantity}
                      onChange={(e) =>
                        setEditRoom({ ...editRoom, quantity: e.target.value })
                      }
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">
                      Mínimo de dias
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editRoom.minStayDays}
                      onChange={(e) => setEditRoom({ ...editRoom, minStayDays: e.target.value })}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">
                    Capacidade Máxima (hóspedes)
                  </span>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="2"
                    value={editRoom.maxGuests}
                    onChange={(e) =>
                      setEditRoom({ ...editRoom, maxGuests: e.target.value })
                    }
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Camas</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {BED_TYPES.map((bedType) => {
                      const quantity = getBedQuantity(editRoom.beds, bedType);
                      return (
                        <div
                          key={bedType}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5"
                        >
                          <span className="text-sm text-slate-200">{BED_TYPE_LABELS[bedType]}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditRoom({
                                  ...editRoom,
                                  beds: setBedQuantity(editRoom.beds, bedType, Math.max(0, quantity - 1)),
                                })
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
                            >
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-semibold text-white">{quantity}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditRoom({
                                  ...editRoom,
                                  beds: setBedQuantity(editRoom.beds, bedType, quantity + 1),
                                })
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">
                    Adicionar Novas Fotos
                  </span>
                  <input
                    ref={editPhotoInputRef}
                    id="edit-room-photo-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => selectEditPhotos(e.target.files)}
                    className="sr-only"
                  />
                  <label
                    htmlFor="edit-room-photo-upload"
                    className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-sky-400/40 bg-slate-950/60 px-4 py-3 text-sm font-medium text-sky-200 transition hover:border-sky-300 hover:bg-sky-500/10"
                  >
                    Escolher fotos do computador
                  </label>
                  <p className="text-xs text-slate-500">
                    Limite total: {MAX_PHOTOS_PER_ROOM} fotos por quarto.
                  </p>
                </div>

                {editRoom.existingPhotoUrls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Fotos atuais:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {editRoom.existingPhotoUrls.map((url, index) => (
                        <div key={`${url}-${index}`} className="space-y-1 rounded-xl border border-white/10 bg-slate-950/40 p-2">
                          <img src={url} alt={`Foto ${index + 1}`} className="h-20 w-full rounded-lg object-cover" />
                          <button
                            type="button"
                            onClick={() => removeExistingEditPhoto(index)}
                            className="w-full rounded-lg border border-white/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {editRoom.newPhotoFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">
                      Novas fotos selecionadas ({editRoom.newPhotoFiles.length}):
                    </p>
                    <div className="space-y-2">
                      {editRoom.newPhotoFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                          <span className="min-w-0 flex-1 truncate pr-3 text-xs text-slate-200">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeNewEditPhoto(index)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* COMODIDADES */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <p className="text-sm font-medium text-slate-200">Comodidades</p>
                  
                  {/* TABS */}
                  <div className="flex gap-2 border-b border-white/10">
                    <button
                      type="button"
                      onClick={() => setEditAmenitiesTab('preset')}
                      className={`px-3 py-2 text-xs font-semibold transition ${
                        editAmenitiesTab === 'preset'
                          ? 'border-b-2 border-sky-400 text-sky-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Pré-selecionadas
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditAmenitiesTab('custom')}
                      className={`px-3 py-2 text-xs font-semibold transition ${
                        editAmenitiesTab === 'custom'
                          ? 'border-b-2 border-sky-400 text-sky-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Customizadas
                    </button>
                  </div>

                  {/* PRESET AMENITIES */}
                  {editAmenitiesTab === 'preset' && (
                    <div className="space-y-3 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {PRESET_AMENITIES.map((amenity: string) => (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleAmenityEdit(amenity)}
                            className={`rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${
                              editRoom.selectedAmenities.includes(amenity)
                                ? 'border-sky-400 bg-sky-400/20 text-sky-300'
                                : 'border-white/10 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            {amenity}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CUSTOM AMENITIES */}
                  {editAmenitiesTab === 'custom' && (
                    <div className="space-y-3 pt-3">
                      <input
                        type="text"
                        placeholder="Separe por vírgula (ex: Churrasqueira, Piscina)"
                        value={editRoom.customAmenities}
                        onChange={(e) =>
                          setEditRoom({
                            ...editRoom,
                            customAmenities: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-sky-500"
                      />
                      <div className="space-y-2 pt-2">
                        <p className="text-xs text-slate-400">Comodidades selecionadas:</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ...editRoom.selectedAmenities,
                            ...(editRoom.customAmenities
                              .split(',')
                              .map((a) => a.trim())
                              .filter((a) => a)),
                          ].map((amenity) => (
                            <span
                              key={amenity}
                              className="inline-block rounded-lg bg-sky-400/20 px-2.5 py-1.5 text-xs text-sky-300 font-medium"
                            >
                              {amenity}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="sticky bottom-0 z-10 flex gap-3 border-t border-white/10 bg-slate-900 pt-4">
                  <button
                    type="submit"
                    disabled={isUpdatingRoom}
                    className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdatingRoom ? 'Atualizando...' : 'Atualizar Quarto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    disabled={isUpdatingRoom}
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={roomToDelete !== null}
        title="Remover quarto?"
        description="Esta ação remove o quarto de forma permanente e não pode ser desfeita."
        confirmLabel="Confirmar remoção"
        loading={isDeletingRoom}
        onConfirm={handleRoomDeleteConfirm}
        onCancel={() => { if (!isDeletingRoom) setRoomToDelete(null); }}
      />
    </div>
  );
}

