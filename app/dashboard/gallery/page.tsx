'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Trash2, ArrowUp, ArrowDown, ImagePlus } from 'lucide-react';

import { useToast } from '@/components/toast-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';

type GalleryPhoto = {
  id: number;
  url: string;
  caption: string | null;
  sortOrder: number;
};

const MAX_PHOTOS = 60;

export default function GalleryPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<GalleryPhoto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/gallery');
      if (res.ok) {
        const data = await res.json();
        setPhotos(Array.isArray(data) ? data : []);
      } else {
        showToast('Erro ao carregar a galeria');
      }
    } catch {
      showToast('Erro de conexão ao carregar a galeria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const availableSlots = MAX_PHOTOS - photos.length;
    const accepted = incoming.slice(0, Math.max(availableSlots, 0));

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (accepted.length === 0) {
      showToast(`Limite de ${MAX_PHOTOS} fotos na galeria`);
      return;
    }

    if (accepted.length < incoming.length) {
      showToast(`Apenas ${accepted.length} fotos foram enviadas (limite de ${MAX_PHOTOS})`);
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (const file of accepted) {
        formData.append('photos', file);
      }

      const uploadRes = await fetch('/api/tenant/gallery/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadPayload = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadPayload?.error || 'Falha no upload das fotos');
      }

      const createRes = await fetch('/api/tenant/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: uploadPayload.urls }),
      });
      const createPayload = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createPayload?.error || 'Falha ao salvar as fotos');
      }

      showToast('Fotos adicionadas à galeria!');
      fetchPhotos();
    } catch (error: any) {
      showToast(error?.message || 'Erro ao enviar fotos');
    } finally {
      setIsUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!photoToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tenant/gallery/${photoToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Foto removida da galeria');
        setPhotoToDelete(null);
        setPhotos((prev) => prev.filter((photo) => photo.id !== photoToDelete.id));
      } else {
        const error = await res.json();
        showToast(`Erro: ${error.error || 'Não foi possível remover'}`);
      }
    } catch {
      showToast('Erro de conexão ao remover foto');
    } finally {
      setIsDeleting(false);
    }
  };

  const movePhoto = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= photos.length) return;

    const reordered = [...photos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setPhotos(reordered);
    setReorderingId(moved.id);

    try {
      const res = await fetch('/api/tenant/gallery/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((photo) => photo.id) }),
      });

      if (!res.ok) {
        throw new Error('Falha ao reordenar');
      }
    } catch {
      showToast('Erro ao salvar a nova ordem');
      fetchPhotos();
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Marketing</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Galeria de fotos</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Fotos gerais da pousada (piscina, áreas comuns, praia, café da manhã) exibidas na página inicial do site.
              Não são as fotos de cada quarto — isso é gerenciado em Quartos.
            </p>
          </div>
        </div>
      </section>

      {/* UPLOAD */}
      <section className="rounded-[30px] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
              <ImageIcon className="h-5 w-5 text-sky-300" />
            </div>
            <h3 className="text-xl font-semibold text-white">
              Fotos da galeria ({photos.length}/{MAX_PHOTOS})
            </h3>
          </div>
        </div>

        <input
          ref={fileInputRef}
          id="gallery-photo-upload"
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="sr-only"
          disabled={isUploading || photos.length >= MAX_PHOTOS}
        />
        <label
          htmlFor="gallery-photo-upload"
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-400/40 bg-slate-950/60 px-4 py-6 text-sm font-medium text-sky-200 transition hover:border-sky-300 hover:bg-sky-500/10 ${
            isUploading || photos.length >= MAX_PHOTOS ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <ImagePlus className="h-4 w-4" />
          {isUploading ? 'Enviando fotos...' : 'Escolher fotos do computador'}
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Formatos aceitos: JPG, PNG, WEBP e GIF. Até 5MB por arquivo. Use as setas para definir a ordem de exibição no site.
        </p>

        {loading ? (
          <p className="mt-6 text-slate-400">Carregando galeria...</p>
        ) : photos.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400 text-center py-6 border border-dashed border-white/10 rounded-2xl">
            Nenhuma foto na galeria ainda. Envie as primeiras fotos acima.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || 'Foto da pousada'}
                  className="h-40 w-full object-cover"
                />
                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/50 via-transparent to-black/60 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPhotoToDelete(photo)}
                      className="rounded-lg border border-white/10 bg-slate-950/80 p-1.5 text-rose-300 hover:bg-rose-500/20"
                      aria-label="Remover foto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => movePhoto(index, -1)}
                      disabled={index === 0 || reorderingId === photo.id}
                      className="rounded-lg border border-white/10 bg-slate-950/80 p-1.5 text-slate-200 hover:bg-sky-500/20 disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePhoto(index, 1)}
                      disabled={index === photos.length - 1 || reorderingId === photo.id}
                      className="rounded-lg border border-white/10 bg-slate-950/80 p-1.5 text-slate-200 hover:bg-sky-500/20 disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[10px] text-slate-300">
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={photoToDelete !== null}
        title="Remover foto"
        description="Esta foto será removida permanentemente da galeria do site. Deseja continuar?"
        loading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setPhotoToDelete(null)}
      />
    </div>
  );
}
