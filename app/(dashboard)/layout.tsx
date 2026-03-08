"use client";

import { DesktopSidebar, MobileSidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BusinessGuard } from "@/components/layout/business-guard";
import { AuthBootstrap } from "@/components/layout/auth-bootstrap";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AuthBootstrap />
      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Mobile sidebar (Sheet) */}
      <MobileSidebar />

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <BusinessGuard>{children}</BusinessGuard>
        </main>
      </div>
    </div>
  );
}
