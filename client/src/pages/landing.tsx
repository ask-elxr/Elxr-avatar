import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    setLocation('/avatar-select');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-4xl w-full text-center">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 font-satoshi">
            ELXR
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 font-satoshi">
            AI-Powered Personal Growth
          </p>
        </div>

        {/* Hero Text */}
        <div className="mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 font-satoshi">
            Choose Your Expert Guide
          </h2>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto font-satoshi">
            Connect with AI avatars trained by world-class experts in health, mindfulness, performance, and wellness
          </p>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleGetStarted}
          className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold px-12 py-6 text-lg font-satoshi rounded-full shadow-2xl transition-all duration-300 hover:scale-105"
          data-testid="button-get-started"
        >
          Get Started
        </Button>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-purple-500 text-4xl mb-4">🧠</div>
            <h3 className="text-white font-bold mb-2 font-satoshi">Expert Knowledge</h3>
            <p className="text-gray-400 text-sm font-satoshi">Real expertise from world-class professionals</p>
          </div>
          <div className="text-center">
            <div className="text-purple-500 text-4xl mb-4">💬</div>
            <h3 className="text-white font-bold mb-2 font-satoshi">Natural Conversation</h3>
            <p className="text-gray-400 text-sm font-satoshi">Voice and text interaction with AI avatars</p>
          </div>
          <div className="text-center">
            <div className="text-purple-500 text-4xl mb-4">🎯</div>
            <h3 className="text-white font-bold mb-2 font-satoshi">Personalized Guidance</h3>
            <p className="text-gray-400 text-sm font-satoshi">Tailored advice for your unique journey</p>
          </div>
        </div>
      </div>
    </div>
  );
}
