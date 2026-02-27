import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface DisclaimerProps {
  onAccept: (rememberConversations: boolean) => void;
}

export function Disclaimer({ onAccept }: DisclaimerProps) {
  const [remember, setRemember] = useState(false);

  const handleAccept = () => {
    localStorage.setItem('disclaimer-accepted', 'true');
    localStorage.setItem('memory-enabled', remember.toString());
    onAccept(remember);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900 p-4">
      <div className="w-full max-w-xl bg-zinc-900/95 border border-white/15 rounded-2xl p-6 sm:p-8 shadow-2xl">
        
        <h2 className="text-2xl font-semibold text-white text-center mb-6">Before we start</h2>
        
        <div className="text-white/80 text-sm leading-relaxed space-y-3 mb-6">
          <p>MUM provides general information and conversational guidance only.</p>
          <p>It does not provide medical, mental health, legal, or professional advice, and it does not replace working with a qualified professional who knows your personal situation.</p>
          <p>Any insights shared here are meant to help you think, reflect, and explore options — not to diagnose, treat, or direct medical or therapeutic decisions.</p>
          <p>If you are dealing with a medical condition, mental health concern, or urgent situation, please consult a licensed professional or appropriate services.</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-white font-medium mb-1" data-testid="text-memory-status">
                {remember ? "Remember my conversations" : "Anonymous session"}
              </p>
              <p className="text-sm text-white/50">
                {remember ? "Personalized with memory" : "Private and temporary"}
              </p>
            </div>
            <Switch
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked as boolean)}
              className="data-[state=checked]:bg-primary"
              data-testid="switch-memory-toggle"
              aria-label="Toggle conversation memory"
            />
          </div>
        </div>

        <Button
          onClick={handleAccept}
          className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-5 text-base rounded-xl transition-all"
          data-testid="button-continue"
        >
          I understand — let's continue
        </Button>
      </div>
    </div>
  );
}
