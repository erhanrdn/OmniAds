import { type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePreferencesStore } from "@/store/preferences-store";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  badge,
}: PlaceholderPageProps) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm max-w-xs">
          {description ?? (language === "tr" ? "Bu sayfa hazırlanıyor. Yakında tekrar kontrol edin." : "This page is under construction. Check back soon.")}
        </p>
      </div>
    </div>
  );
}
