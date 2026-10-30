"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/utils";
import { Gift, Plus, Power, PowerOff, Trash2, X } from "lucide-react";

interface Addon {
  id: number;
  name: string;
  description: string | null;
  price: string | number;
  status: "active" | "inactive";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AddonsPage() {
  const { showToast } = useToast();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreatingAddon, setIsCreatingAddon] = useState(false);
  const [addonToDelete, setAddonToDelete] = useState<number | null>(null);
  const [isDeletingAddon, setIsDeletingAddon] = useState(false);
  const [newAddon, setNewAddon] = useState({
    name: "",
    description: "",
    price: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/addons");
      const data = await res.json();
      setAddons(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erro ao carregar pacotes:", error);
      showToast("Erro ao carregar pacotes e adicionais");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateAddon = async (e: FormEvent) => {
    e.preventDefault();
    if (isCreatingAddon) return;

    if (!newAddon.name || !newAddon.price) {
      showToast("Preencha o nome e o preço do pacote.");
      return;
    }

    setIsCreatingAddon(true);
    try {
      const res = await fetch("/api/tenant/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAddon.name,
          description: newAddon.description,
          price: parseCurrencyInput(newAddon.price),
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewAddon({ name: "", description: "", price: "" });
        fetchData();
        showToast("Pacote criado com sucesso!");
      } else {
        const errorData = await res.json();
        showToast(`Erro: ${errorData.error}`);
      }
    } catch (error) {
      showToast("Erro de conexão ao criar pacote.");
    } finally {
      setIsCreatingAddon(false);
    }
  };

  const toggleAddonStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`/api/tenant/addons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        showToast("Erro ao alterar status do pacote.");
        return;
      }

      fetchData();
      showToast(newStatus === "active" ? "Pacote ativado!" : "Pacote desativado.");
    } catch (error) {
      showToast("Erro de conexão ao alterar status do pacote.");
    }
  };

  const deleteAddon = (id: number) => {
    setAddonToDelete(id);
  };

  const handleAddonDeleteConfirm = async () => {
    if (addonToDelete === null) return;
    setIsDeletingAddon(true);
    try {
      await fetch(`/api/tenant/addons/${addonToDelete}`, { method: "DELETE" });
      setAddonToDelete(null);
      fetchData();
      showToast("Pacote excluído com sucesso.");
    } catch (error) {
      showToast("Erro ao excluir pacote.");
    } finally {
      setIsDeletingAddon(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-white font-medium">
        Carregando pacotes e adicionais...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-slate-950/20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
            Revenue Management
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Pacotes & Adicionais
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Cadastre itens extras (decoração, jantar, spa, café da manhã especial...) que aparecem na tela de
            reserva do site público, para o hóspede adicionar à estadia.
          </p>
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
              <Gift className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Pacotes cadastrados</h3>
              <p className="mt-1 text-xs text-slate-500">
                {addons.filter((a) => a.status === "active").length} ativo
                {addons.filter((a) => a.status === "active").length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> Novo
          </button>
        </div>

        <div className="space-y-4">
          {addons.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-6 text-center text-sm text-slate-400">
              Nenhum pacote criado ainda.
            </p>
          ) : (
            addons.map((addon) => (
              <div
                key={addon.id}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition-all hover:border-white/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-white">{addon.name}</span>
                    <span
                      className={
                        addon.status === "active"
                          ? "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-400"
                          : "rounded-full bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-500"
                      }
                    >
                      {addon.status === "active" ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  {addon.description ? (
                    <p className="mt-1 text-sm text-slate-400">{addon.description}</p>
                  ) : null}
                  <p className="mt-2 text-sm font-semibold text-amber-300">
                    {formatCurrency(Number(addon.price))}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAddonStatus(addon.id, addon.status)}
                    className={`rounded-xl border border-white/10 p-2 transition ${addon.status === "active" ? "bg-slate-900 text-amber-400 hover:bg-amber-400/10" : "bg-slate-900 text-emerald-400 hover:bg-emerald-400/10"}`}
                    title={addon.status === "active" ? "Desativar" : "Ativar"}
                  >
                    {addon.status === "active" ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteAddon(addon.id)}
                    className="rounded-xl border border-white/10 bg-slate-900 p-2 text-rose-400 transition hover:bg-rose-400/10"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="w-full max-w-md rounded-[30px] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">Criar Pacote</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Esse item vai aparecer na tela de reserva do site público.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl bg-slate-950/50 p-2 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAddon} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Nome</span>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Jantar Romântico"
                    value={newAddon.name}
                    onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Descrição (opcional)</span>
                  <input
                    type="text"
                    placeholder="Ex: Jantar a dois na praia com atendimento personalizado"
                    value={newAddon.description}
                    onChange={(e) => setNewAddon({ ...newAddon, description: e.target.value })}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Preço</span>
                  <input
                    type="text"
                    required
                    placeholder="R$ 0,00"
                    value={newAddon.price}
                    onChange={(e) =>
                      setNewAddon({ ...newAddon, price: formatCurrencyInput(e.target.value) })
                    }
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                  />
                </label>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isCreatingAddon}
                    className="flex-1 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingAddon ? "Criando..." : "Criar Pacote"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isCreatingAddon}
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
        open={addonToDelete !== null}
        title="Excluir pacote?"
        description="Esta ação exclui o pacote de forma permanente e não pode ser desfeita."
        confirmLabel="Confirmar exclusão"
        loading={isDeletingAddon}
        onConfirm={handleAddonDeleteConfirm}
        onCancel={() => {
          if (!isDeletingAddon) setAddonToDelete(null);
        }}
      />
    </div>
  );
}
