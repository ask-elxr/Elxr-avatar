import { cn } from "@/lib/utils";
import loadingVideo from "@assets/elxr_Transparent-DarkBg_1763952442851.mp4";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-40 h-40",
    md: "w-60 h-60",
    lg: "w-80 h-80"
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
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-contain"
        aria-hidden="true"
      >
        <source src={loadingVideo} type="video/mp4" />
      </video>
    </div>
  );
}
