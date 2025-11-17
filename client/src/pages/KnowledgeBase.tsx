import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentViewer } from "@/components/DocumentViewer";
import { FileText, Upload, Home } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function KnowledgeBase() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("upload");

  const handleUploadComplete = () => {
    // Refresh documents list
    queryClient.invalidateQueries({ queryKey: ['/api/documents/user', user?.id] });
    // Switch to documents tab to see the newly uploaded document
    setActiveTab("documents");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black dark:bg-black">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white">
                  <Home className="w-4 h-4" />
                  Back to Chat
                </Button>
              </Link>
              <div className="h-6 w-px bg-white/10" />
              <h1 className="text-2xl font-semibold text-white">Knowledge Base</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-white/60">
                {user?.email || 'Guest User'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Info Card */}
          <Card className="mb-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="w-5 h-5" />
                Personal Knowledge Base
              </CardTitle>
              <CardDescription className="text-white/70">
                Upload PDF documents and video/audio files to enhance your AI avatars' knowledge. 
                Your uploads are processed, embedded, and stored in a vector database for intelligent retrieval during conversations.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Main Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-white/5">
              <TabsTrigger value="upload" className="gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <Upload className="w-4 h-4" />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <FileText className="w-4 h-4" />
                My Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-6">
              <DocumentUpload onUploadComplete={handleUploadComplete} />
              
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg text-white">How It Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/70">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-white/90">Upload Your Content</p>
                      <p>Drop PDF documents or video/audio files (MP4, MOV, MP3, WAV, etc.)</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-white/90">Automatic Processing</p>
                      <p>PDFs are text-extracted, videos are transcribed using OpenAI Whisper</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-white/90">Intelligent Chunking & Embedding</p>
                      <p>Content is split into chunks and converted to vector embeddings</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-white/90">Vector Database Storage</p>
                      <p>Embeddings stored in Pinecone for semantic search during conversations</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold">
                      5
                    </div>
                    <div>
                      <p className="font-medium text-white/90">Avatar Integration</p>
                      <p>AI avatars can now reference your personal knowledge in conversations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <DocumentViewer />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
