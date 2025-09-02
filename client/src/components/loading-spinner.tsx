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
        "border-4 border-primary border-t-transparent rounded-full animate-spin",
        sizeClasses[size],
        className
      )}
      data-testid="loading-spinner"
    />
  );
}
