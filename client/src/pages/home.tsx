import { AvatarChat } from "@/components/avatar-chat";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'documents'>('chat');

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col h-screen">
        {/* Tab Navigation */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-center p-4">
            <div className="flex space-x-2 bg-muted rounded-lg p-1">
              <Button
                variant={activeTab === 'chat' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('chat')}
                className="flex items-center gap-2"
                data-testid="button-chat-tab"
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </Button>
              <Button
                variant={activeTab === 'documents' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('documents')}
                className="flex items-center gap-2"
                data-testid="button-documents-tab"
              >
                <FileText className="w-4 h-4" />
                Documents
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <AvatarChat />
          )}
          {activeTab === 'documents' && (
            <div className="p-6 max-w-4xl mx-auto">
              <DocumentUpload />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
