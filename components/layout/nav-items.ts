import {
  LayoutDashboard,
  Facebook,
  Search,
  Music2,
  Image,
  Ghost,
  Palette,
  Globe,
  FileText,
  BarChart3,
  LineChart,
  BrainCircuit,
  Plug,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
}

export const navItems: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, group: "Main" },
  { label: "Meta", href: "/platforms/meta", icon: Facebook, group: "Platforms" },
  { label: "Google", href: "/platforms/google", icon: Search, group: "Platforms" },
  { label: "TikTok", href: "/platforms/tiktok", icon: Music2, group: "Platforms" },
  { label: "Pinterest", href: "/platforms/pinterest", icon: Image, group: "Platforms" },
  { label: "Snapchat", href: "/platforms/snapchat", icon: Ghost, group: "Platforms" },
  { label: "Analytics", href: "/analytics", icon: LineChart, group: "Platforms" },
  { label: "GEO Intelligence", href: "/geo-intelligence", icon: BrainCircuit, group: "Platforms" },
  { label: "Creatives", href: "/creatives", icon: Palette, group: "Assets" },
  { label: "Landing Pages", href: "/landing-pages", icon: Globe, group: "Assets" },
  { label: "Copies", href: "/copies", icon: FileText, group: "Assets" },
  { label: "Reports", href: "/reports", icon: BarChart3, group: "Manage" },
  { label: "Integrations", href: "/integrations", icon: Plug, group: "Manage" },
  { label: "Team", href: "/team", icon: Users, group: "Manage" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Manage" },
];
