import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrialTimeResponse {
  isTrialUser: boolean;
  remainingSeconds: number | null;
  remainingMinutes: number | null;
  expiresAt: string | null;
  isExpired: boolean;
  totalDurationHours?: number;
}

interface TrialCountdownProps {
  className?: string;
  compact?: boolean;
  onExpired?: () => void;
}

export function TrialCountdown({ className, compact = false, onExpired }: TrialCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hasNotifiedExpiry, setHasNotifiedExpiry] = useState(false);

  const { data: trialTime, refetch } = useQuery<TrialTimeResponse>({
    queryKey: ["/api/subscription/trial-time"],
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (trialTime?.remainingSeconds !== undefined && trialTime.remainingSeconds !== null) {
      setTimeLeft(trialTime.remainingSeconds);
    }
  }, [trialTime]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && !hasNotifiedExpiry) {
      setHasNotifiedExpiry(true);
      onExpired?.();
      refetch();
    }
  }, [timeLeft, hasNotifiedExpiry, onExpired, refetch]);

  if (!trialTime?.isTrialUser) {
    return null;
  }

  if (trialTime.isExpired || timeLeft === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400",
          className
        )}
        data-testid="trial-expired-banner"
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm font-medium">Trial Expired</span>
      </div>
    );
  }

  if (timeLeft === null) {
    return null;
  }

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const formatTime = (value: number) => value.toString().padStart(2, "0");

  const isLowTime = timeLeft < 300;
  const isCritical = timeLeft < 60;

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono",
          isCritical
            ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
            : isLowTime
            ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400"
            : "bg-primary/10 border border-primary/30 text-primary",
          className
        )}
        data-testid="trial-countdown-compact"
      >
        <Clock className="w-3 h-3" />
        <span>
          {hours > 0 && `${formatTime(hours)}:`}
          {formatTime(minutes)}:{formatTime(seconds)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        isCritical
          ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
          : isLowTime
          ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-400"
          : "bg-primary/10 border border-primary/30 text-primary",
        className
      )}
      data-testid="trial-countdown"
    >
      <Clock className={cn("w-4 h-4", isCritical && "animate-bounce")} />
      <div className="flex flex-col">
        <span className="text-xs opacity-70">Free Trial</span>
        <span className="text-sm font-mono font-bold">
          {hours > 0 && `${formatTime(hours)}:`}
          {formatTime(minutes)}:{formatTime(seconds)}
        </span>
      </div>
    </div>
  );
}

export default TrialCountdown;
