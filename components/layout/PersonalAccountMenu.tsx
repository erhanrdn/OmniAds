"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, LogOut, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { clearAuthScopedClientState } from "@/lib/client-auth-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PersonalAccountMenuProps {
  userName: string;
}

export function PersonalAccountMenu({ userName }: PersonalAccountMenuProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Cache-Control": "no-store" },
      });
      if (!response.ok) {
        throw new Error("Could not sign out. Please try again.");
      }

      clearAuthScopedClientState();
      logClientAuthEvent("logout_completed", { userName });
      window.location.assign("/");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not sign out. Please try again.";
      setSignOutError(message);
      logClientAuthEvent("logout_failed", { userName, message });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <span className="hidden sm:inline">{userName}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-sm font-medium">{userName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2">
          <Settings className="h-4 w-4" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2">
          <HelpCircle className="h-4 w-4" />
          Help Docs
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2">
          <Sparkles className="h-4 w-4" />
          What's new
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-destructive focus:text-destructive"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          <LogOut className="h-4 w-4 text-destructive" />
          {isSigningOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
        {signOutError ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-destructive opacity-100">
              {signOutError}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
