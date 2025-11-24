import { cn } from "@/lib/utils";
import loadingVideo from "@assets/elxr_Transparent-DarkBg_1763948937554.mov";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32"
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
        <source src={loadingVideo} type="video/quicktime" />
      </video>
    </div>
  );
}
