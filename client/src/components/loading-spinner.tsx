import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16"
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-center",
        sizeClasses[size],
        className
      )}
      data-testid="loading-spinner"
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative w-full h-full">
        <div className="absolute inset-0 rounded-full border-4 border-purple-200 dark:border-purple-900/30"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 dark:border-t-purple-400 animate-spin"></div>
      </div>
    </div>
  );
}
