import {
  LayoutDashboard,
  Facebook,
  Search,
  Music2,
  Image,
  Ghost,
  Palette,
  Mail,
  Globe,
  FileText,
  BarChart3,
  LineChart,
  BrainCircuit,
  SearchCheck,
  Plug,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { PlanId } from "@/lib/pricing/plans";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
  requiredPlan?: PlanId;
}

export const navItems: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, group: "Main" },
  { label: "Meta", href: "/platforms/meta", icon: Facebook, group: "Platforms", requiredPlan: "growth" },
  { label: "Google Ads", href: "/google-ads", icon: Search, group: "Platforms", requiredPlan: "growth" },
  { label: "TikTok", href: "/platforms/tiktok", icon: Music2, group: "Platforms", requiredPlan: "pro" },
  { label: "Pinterest", href: "/platforms/pinterest", icon: Image, group: "Platforms", requiredPlan: "pro" },
  { label: "Snapchat", href: "/platforms/snapchat", icon: Ghost, group: "Platforms", requiredPlan: "pro" },
  { label: "Klaviyo", href: "/platforms/klaviyo", icon: Mail, group: "Platforms", requiredPlan: "pro" },
  { label: "Analytics", href: "/analytics", icon: LineChart, group: "Platforms", requiredPlan: "growth" },
  { label: "GEO Intelligence", href: "/geo-intelligence", icon: BrainCircuit, group: "Platforms", requiredPlan: "pro" },
  { label: "SEO Intelligence", href: "/seo-intelligence", icon: SearchCheck, group: "Platforms", requiredPlan: "pro" },
  { label: "Creatives", href: "/creatives", icon: Palette, group: "Assets", requiredPlan: "growth" },
  { label: "Landing Pages", href: "/landing-pages", icon: Globe, group: "Assets", requiredPlan: "growth" },
  { label: "Copies", href: "/copies", icon: FileText, group: "Assets", requiredPlan: "growth" },
  { label: "Reports", href: "/reports", icon: BarChart3, group: "Manage", requiredPlan: "pro" },
  { label: "Integrations", href: "/integrations", icon: Plug, group: "Manage" },
  { label: "Team", href: "/team", icon: Users, group: "Manage", requiredPlan: "scale" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Manage" },
];
