"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";

interface BusinessRow {
  id: string;
  name: string;
  created_at: string;
  plan_override: string | null;
  is_demo_business: boolean;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  plan_id: string | null;
  subscription_status: string | null;
  member_count: number;
  integration_count: number;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter", growth: "Growth", pro: "Pro", scale: "Scale",
};
const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-600",
  growth: "bg-blue-100 text-blue-700",
  pro: "bg-indigo-100 text-indigo-700",
  scale: "bg-purple-100 text-purple-700",
};

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, plan]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (plan) params.set("plan", plan);
    fetch(`/api/admin/businesses?${params}`)
      .then((r) => r.json())
      .then((d) => { setBusinesses(d.businesses ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, plan]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Workspace'ler</h1>
        <p className="text-sm text-gray-500 mt-1">Toplam <span className="font-semibold text-gray-700">{total}</span> workspace</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Workspace veya owner ara..."
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Tüm Planlar</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
            <option value="scale">Scale</option>
          </select>
        </div>
        {(search || plan) && (
          <button onClick={() => { setSearch(""); setPlan(""); }} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Temizle
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
              <th className="text-left px-5 py-3 font-semibold">Workspace</th>
              <th className="text-left px-5 py-3 font-semibold">Owner</th>
              <th className="text-left px-5 py-3 font-semibold">Plan</th>
              <th className="text-left px-5 py-3 font-semibold">Üye</th>
              <th className="text-left px-5 py-3 font-semibold">Entegrasyon</th>
              <th className="text-left px-5 py-3 font-semibold">Oluşturulma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && businesses.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Sonuç bulunamadı.</td></tr>
            )}
            {!loading && businesses.map((b) => {
              const effectivePlan = b.plan_override || b.plan_id || "starter";
              return (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/businesses/${b.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {b.name}
                    </Link>
                    {b.is_demo_business && (
                      <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">Demo</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/users/${b.owner_id}`} className="hover:text-indigo-600">
                      <p className="text-gray-700">{b.owner_name}</p>
                      <p className="text-xs text-gray-400">{b.owner_email}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_COLORS[effectivePlan] ?? "bg-gray-100 text-gray-600"}`}>
                      {PLAN_LABELS[effectivePlan] ?? effectivePlan}
                    </span>
                    {b.plan_override && (
                      <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Override</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{b.member_count}</td>
                  <td className="px-5 py-3.5 text-gray-500">{b.integration_count}</td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    {new Date(b.created_at).toLocaleDateString("tr-TR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Sayfa {page} / {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" /> Önceki
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Sonraki <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
