"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  editor: "bg-blue-50 text-blue-700 border-blue-200",
};

const emptyForm = { name: "", email: "", password: "", role: "editor" };

export function UtilizadoresClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/utilizadores");
      if (!res.ok) throw new Error("Sem permissão ou erro ao carregar");
      setUsers(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setFormError("");
    setShowForm(true);
  }

  async function handleSave() {
    setFormError("");
    if (!form.name || !form.email) {
      setFormError("Nome e email são obrigatórios.");
      return;
    }
    if (!editingId && !form.password) {
      setFormError("Password é obrigatória para novo utilizador.");
      return;
    }

    setSaving(true);
    try {
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { id: editingId, ...form }
        : form;

      const res = await fetch("/api/utilizadores", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Erro ao guardar");
        return;
      }

      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch("/api/utilizadores", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Erro ao apagar");
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">A carregar...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilizadores</h1>
          <p className="text-sm text-muted-foreground mt-1">{users.length} utilizador{users.length !== 1 ? "es" : ""}</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          Novo utilizador
        </button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-5 bg-card space-y-4">
          <h2 className="font-medium text-sm">
            {editingId ? "Editar utilizador" : "Novo utilizador"}
          </h2>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="email@exemplo.pt"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Password {editingId && <span className="text-muted-foreground/60">(deixar vazio para não alterar)</span>}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={editingId ? "Nova password (opcional)" : "Password"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Papel</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
              >
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "A guardar..." : editingId ? "Guardar alterações" : "Criar utilizador"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 border rounded-md text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Nome</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Papel</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Criado em</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(tu)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLOR[u.role] ?? "bg-muted text-muted-foreground"}`}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(u.createdAt).toLocaleDateString("pt-PT")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs px-3 py-1 border rounded hover:bg-muted"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Apagar ${u.name}?`)) handleDelete(u.id);
                      }}
                      disabled={deletingId === u.id || u.id === currentUserId}
                      className="text-xs px-3 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === u.id ? "..." : "Apagar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
