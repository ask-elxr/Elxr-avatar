import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card className="w-full max-w-2xl bg-black/80 border-purple-500/30 backdrop-blur-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-purple-600/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-purple-400"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-center text-white">
            Welcome to ELXR
          </CardTitle>
          <CardDescription className="text-center text-gray-300 text-base">
            You're about to talk with an AI avatar powered by real expert knowledge
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-6">
            <p className="text-gray-200 leading-relaxed text-center">
              By continuing, you acknowledge you are speaking with an <strong className="text-purple-300">AI avatar</strong> and agree to ELXR's{" "}
              <a href="#" className="text-purple-400 hover:text-purple-300 underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-purple-400 hover:text-purple-300 underline">
                Privacy Policy
              </a>
              . This conversation may be recorded and used to improve the experience.{" "}
              <strong className="text-red-400">Do not share personal medical or financial details.</strong>
            </p>
          </div>

          {/* Memory Toggle */}
          <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              Choose Your Experience
            </h3>
            <label className="flex items-center space-x-3 bg-white/10 p-4 rounded-xl cursor-pointer hover:bg-white/15 transition-colors">
              <Checkbox
                id="memory"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked as boolean)}
                className="border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                data-testid="checkbox-memory-toggle"
              />
              <span className="text-lg text-white">
                {remember ? "✅ Remember my conversations" : "🕶️ Stay anonymous this session"}
              </span>
            </label>
            <p className="text-sm text-gray-400 mt-3 text-center">
              {remember 
                ? "Your conversations will be remembered for a personalized experience across sessions"
                : "Your conversations won't be saved - completely private and anonymous"}
            </p>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-purple-950/20 rounded-lg border border-purple-500/10">
            <Checkbox
              id="terms"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked as boolean)}
              className="mt-1 border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              data-testid="checkbox-accept-terms"
            />
            <label
              htmlFor="terms"
              className="text-sm text-gray-300 leading-relaxed cursor-pointer select-none"
            >
              I have read and agree to the terms stated above. I understand that this is an AI-powered conversation and will not share sensitive personal information.
            </label>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            onClick={handleAccept}
            disabled={!accepted}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            data-testid="button-continue"
          >
            {remember ? "Continue with Memory" : "Continue Anonymously"}
          </Button>
          <p className="text-xs text-gray-500 text-center">
            Your preferences will be saved for this browser session
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
