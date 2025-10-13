import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import elxrLogo from "@assets/Asset 2_1760249308314.png";

interface DisclaimerProps {
  onAccept: (rememberConversations: boolean) => void;
}

export function Disclaimer({ onAccept }: DisclaimerProps) {
  const [accepted, setAccepted] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleAccept = () => {
    if (accepted) {
      localStorage.setItem('disclaimer-accepted', 'true');
      localStorage.setItem('memory-enabled', remember.toString());
      onAccept(remember);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-purple-900 p-4">
      <div className="w-full max-w-xl bg-black/90 border border-purple-500/30 rounded-2xl p-8">
        
        {/* ELXR Logo */}
        <div className="flex justify-center mb-8">
          <img 
            src={elxrLogo} 
            alt="ELXR" 
            className="h-12 w-auto"
            data-testid="img-elxr-logo"
          />
        </div>
        
        {/* Disclaimer Text */}
        <p className="text-gray-300 text-center mb-8 leading-relaxed">
          You're about to speak with an AI avatar. By continuing, you agree to our{" "}
          <a href="#" className="text-purple-400 hover:text-purple-300 underline">Terms</a> and{" "}
          <a href="#" className="text-purple-400 hover:text-purple-300 underline">Privacy Policy</a>.{" "}
          <span className="text-red-400 font-medium">Don't share personal medical or financial information.</span>
        </p>

        {/* Memory Toggle */}
        <div className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-white font-medium mb-1" data-testid="text-memory-status">
                {remember ? "Remember my conversations" : "Anonymous session"}
              </p>
              <p className="text-sm text-gray-400">
                {remember ? "Personalized with memory" : "Private and temporary"}
              </p>
            </div>
            <Switch
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked as boolean)}
              className="data-[state=checked]:bg-purple-600"
              data-testid="switch-memory-toggle"
              aria-label="Toggle conversation memory"
            />
          </div>
        </div>

        {/* Accept Checkbox */}
        <div className="flex items-start gap-3 mb-6">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked as boolean)}
            className="mt-1 border-purple-400 data-[state=checked]:bg-purple-600"
            data-testid="checkbox-accept-terms"
          />
          <label
            htmlFor="terms"
            className="text-sm text-gray-300 cursor-pointer select-none"
          >
            I understand this is an AI conversation and agree to the terms above
          </label>
        </div>

        {/* Continue Button */}
        <Button
          onClick={handleAccept}
          disabled={!accepted}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 text-lg disabled:opacity-50 transition-all"
          data-testid="button-continue"
        >
          {remember ? "Continue with Memory" : "Continue Anonymously"}
        </Button>
      </div>
    </div>
  );
}
