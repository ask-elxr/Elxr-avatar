import { cn } from "@/lib/utils";
import mumLogo from "@assets/mum_logo_small_1769326661442.gif";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-80 h-80",
    md: "w-[480px] h-[480px]",
    lg: "w-[640px] h-[640px]"
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-center bg-black",
        sizeClasses[size],
        className
      )}
      data-testid="loading-spinner"
      aria-hidden="true"
      role="presentation"
    >
      <img
        src={mumLogo}
        alt="Loading"
        className="w-full h-full object-contain"
        aria-hidden="true"
      />
    </div>
  );
}
