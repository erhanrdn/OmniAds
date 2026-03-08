"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, HelpCircle, LogOut, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
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
        >
          <LogOut className="h-4 w-4 text-destructive" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
