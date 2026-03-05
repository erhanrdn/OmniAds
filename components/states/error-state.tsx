import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "The request failed. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h3 className="text-base font-semibold text-destructive">{title}</h3>
      <p className="mt-2 text-sm text-destructive/90">{description}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
