import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AvatarChat() {
  const [isActive, setIsActive] = useState(false);
  const [language, setLanguage] = useState("English");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleChatNow = () => {
    setIsActive(true);
    // Here you would initialize the HeyGen avatar
  };

  return (
    <div className="w-full h-screen flex flex-col">
      {/* Top Section with Gradient */}
      <div className="flex-1 bg-gradient-to-b from-gray-900 via-purple-900 to-transparent relative">
        {/* Language Selector - Top Right */}
        <div className="absolute top-6 right-6 z-10">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-24 bg-white text-gray-900 border-0 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Spanish">Spanish</SelectItem>
              <SelectItem value="French">French</SelectItem>
              <SelectItem value="German">German</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Avatar Section */}
      <div className="flex-shrink-0 bg-gray-200 relative">
        <div className="w-full aspect-[3/4] flex items-center justify-center">
          {!isActive ? (
            <div className="w-full h-full flex items-center justify-center">
              {/* Placeholder Avatar Preview */}
              <div className="w-80 h-96 bg-gray-300 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm">Avatar Preview</p>
                </div>
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src="https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0IiwidXNlcm5hbWUiOiJlN2JjZWNhYWMwZTA0%0D%0ANTZjYjZiZDBjYWFiNzBmZjQ2MSJ9&inIFrame=1"
              className="w-full h-full border-0"
              allow="microphone; camera"
              title="HeyGen Interactive Avatar"
              data-testid="heygen-avatar-iframe"
            />
          )}
        </div>
      </div>

      {/* Bottom Section with Gradient */}
      <div className="flex-1 bg-gradient-to-t from-gray-900 via-purple-900 to-transparent relative flex items-end">
        {/* Bottom Controls */}
        <div className="w-full p-6 flex items-center justify-between">
          {/* Language Selector - Bottom Left */}
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-24 bg-white/10 text-white border-white/20 rounded-lg text-sm backdrop-blur-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Spanish">Spanish</SelectItem>
              <SelectItem value="French">French</SelectItem>
              <SelectItem value="German">German</SelectItem>
            </SelectContent>
          </Select>

          {/* Chat Button */}
          {!isActive && (
            <Button 
              onClick={handleChatNow}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-base font-medium"
              data-testid="button-chat-now"
            >
              Chat now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
