"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Building2, CreditCard, ShieldAlert,
  UserPlus, Activity, AlertTriangle,
} from "lucide-react";

interface Stats {
  users: { total: number; last7d: number; last30d: number; suspended: number; admins: number };
  businesses: { total: number; last7d: number; demo: number };
  planBreakdown: Array<{ planId: string; count: number }>;
  recentUsers: Array<{ id: string; name: string; email: string; created_at: string; is_superadmin: boolean; suspended_at: string | null; auth_provider: string }>;
  recentActivity: Array<{ action: string; target_type: string; meta: any; created_at: string; admin_name: string }>;
  integrationHealth: Array<{
    provider: "meta" | "google";
    connectedBusinesses: number;
    affectedBusinesses: number;
    staleSnapshots: number;
    failedSnapshots: number;
    missingSnapshots: number;
    refreshInProgress: number;
    topIssue: string | null;
  }>;
  integrationHealthSummary?: {
    totalAffectedWorkspaces: number;
    topIssue: string | null;
  };
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

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "user.suspend": "Kullanıcı askıya alındı",
    "user.unsuspend": "Kullanıcı aktif edildi",
    "user.delete": "Kullanıcı silindi",
    "user.reset_password": "Şifre sıfırlandı",
    "user.terminate_sessions": "Sessionlar sonlandırıldı",
    "user.set_admin": "Admin yetkisi verildi",
    "user.revoke_admin": "Admin yetkisi kaldırıldı",
    "business.delete": "Workspace silindi",
    "business.plan_override": "Plan override uygulandı",
    "business.remove_member": "Üye çıkarıldı",
    "discount.create": "İndirim kodu oluşturuldu",
    "discount.delete": "İndirim kodu silindi",
    "discount.toggle": "İndirim kodu durumu değiştirildi",
  };
  return map[action] ?? action;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/stats")
      .then(async (r) => {
        const payload = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              "Admin statistics could not be loaded."
          );
        }
        return payload as Stats;
      })
      .then((payload) => {
        if (cancelled) return;
        setStats(payload);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStats(null);
        setLoadError(
          error instanceof Error ? error.message : "Admin statistics could not be loaded."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-72 bg-gray-200 rounded-xl" />
          <div className="h-72 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Platforma genel bakış</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-medium text-red-800">Admin istatistikleri yuklenemedi.</p>
          <p className="text-sm text-red-700 mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  const userStats = stats?.users ?? {
    total: 0,
    last7d: 0,
    last30d: 0,
    suspended: 0,
    admins: 0,
  };
  const businessStats = stats?.businesses ?? {
    total: 0,
    last7d: 0,
    demo: 0,
  };
  const planBreakdown = stats?.planBreakdown ?? [];
  const recentUsers = stats?.recentUsers ?? [];
  const recentActivity = stats?.recentActivity ?? [];
  const integrationHealth = stats?.integrationHealth ?? [];

  const totalActive = planBreakdown.reduce((s, p) => s + p.count, 0);
  const totalAffectedIntegrations =
    stats?.integrationHealthSummary?.totalAffectedWorkspaces ??
    integrationHealth.reduce((sum, row) => sum + row.affectedBusinesses, 0);
  const topIntegrationIssue = stats?.integrationHealthSummary?.topIssue ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Platforma genel bakış</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/users" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-50 rounded-lg"><Users className="w-4 h-4 text-indigo-600" /></div>
            <p className="text-sm font-medium text-gray-500">Kullanıcılar</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{userStats.total}</p>
          <div className="flex gap-3 mt-2">
            <p className="text-xs text-emerald-600">+{userStats.last7d} bu hafta</p>
            {userStats.suspended > 0 && (
              <p className="text-xs text-red-500">{userStats.suspended} askıda</p>
            )}
          </div>
        </Link>

        <Link href="/admin/businesses" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><Building2 className="w-4 h-4 text-emerald-600" /></div>
            <p className="text-sm font-medium text-gray-500">Workspace'ler</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{businessStats.total}</p>
          <p className="text-xs text-emerald-600 mt-2">+{businessStats.last7d} bu hafta</p>
        </Link>

        <Link href="/admin/subscriptions" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 rounded-lg"><CreditCard className="w-4 h-4 text-amber-600" /></div>
            <p className="text-sm font-medium text-gray-500">Aktif Abonelik</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalActive}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {planBreakdown.map((p) => (
              <span key={p.planId} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PLAN_COLORS[p.planId] ?? "bg-gray-100 text-gray-600"}`}>
                {PLAN_LABELS[p.planId] ?? p.planId}: {p.count}
              </span>
            ))}
          </div>
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-rose-50 rounded-lg"><ShieldAlert className="w-4 h-4 text-rose-600" /></div>
            <p className="text-sm font-medium text-gray-500">Adminler</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{userStats.admins}</p>
          <p className="text-xs text-gray-400 mt-2">Superadmin yetkili</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Entegrasyon Sağlığı</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Sistem genelindeki Meta ve Google senkron sorunları
              </p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            totalAffectedIntegrations > 0
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
          }`}>
            {totalAffectedIntegrations > 0
              ? `${totalAffectedIntegrations} etkilenen workspace`
              : "Sorun yok"}
          </span>
        </div>

        {integrationHealth.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Entegrasyon sağlık verisi henüz yok.
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {integrationHealth.map((provider) => (
                <div key={provider.provider} className="rounded-xl border border-gray-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {provider.provider === "meta" ? "Meta Ads" : "Google Ads"}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {provider.connectedBusinesses} bağlı workspace
                      </p>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                      provider.affectedBusinesses > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {provider.affectedBusinesses > 0
                        ? `${provider.affectedBusinesses} etkilenmiş`
                        : "Healthy"}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{provider.failedSnapshots}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Failed</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{provider.staleSnapshots}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Stale</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{provider.missingSnapshots}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Missing</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{provider.refreshInProgress}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Refreshing</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Ana problem: <span className="font-medium text-gray-700">{provider.topIssue ?? "None"}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Genel ana problem: {topIntegrationIssue ?? "Sorun yok"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Workspace detayları issue hiyerarşisi ile ayrı ekranda yönetilir.
                </p>
              </div>
              <Link
                href="/admin/integrations"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Detaylari gor
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent users */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Son Kayıt Olan Kullanıcılar</h2>
            </div>
            <Link href="/admin/users" className="text-xs text-indigo-600 hover:underline">Tümü →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentUsers.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    {u.name}
                    {u.is_superadmin && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">Admin</span>}
                    {u.suspended_at && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Askıda</span>}
                  </p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <p className="text-xs text-gray-400 shrink-0">{new Date(u.created_at).toLocaleDateString("tr-TR")}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Son Admin Aksiyonları</h2>
            </div>
            <Link href="/admin/activity" className="text-xs text-indigo-600 hover:underline">Tümü →</Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Henüz aksiyon kaydı yok.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-gray-900">{actionLabel(a.action)}</p>
                    <p className="text-xs text-gray-400">{a.admin_name}</p>
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">{new Date(a.created_at).toLocaleDateString("tr-TR")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
