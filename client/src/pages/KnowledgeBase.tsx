import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentViewer } from "@/components/DocumentViewer";
import { TopicFolderUpload } from "@/components/TopicFolderUpload";
import { PineconeNamespaceManager } from "@/components/PineconeNamespaceManager";
import { AvatarNamespaceMatrix } from "@/components/AvatarNamespaceMatrix";
import { CourseIngestion } from "@/components/CourseIngestion";
import { PodcastIngestion } from "@/components/PodcastIngestion";
import { BatchPodcastIngestion } from "@/components/BatchPodcastIngestion";
import { LearningArtifactIngestion } from "@/components/LearningArtifactIngestion";
import { FileText, Upload, Home, Shield, FolderOpen, Database, Link2, GraduationCap, Mic, Package, Brain } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function KnowledgeBase() {
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("upload");

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/documents/user', user?.id] });
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              The Knowledge Base management is restricted to administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Contact an administrator if you need access to upload documents.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/">Go to Chat</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dot-pattern">
      {/* Gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      
      {/* Header */}
      <div className="relative glass-strong border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white transition-all glow-hover">
                  <Home className="w-4 h-4" />
                  Back to Chat
                </Button>
              </Link>
              <div className="h-6 w-px bg-gradient-to-b from-transparent via-purple-500/50 to-transparent" />
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse glow-primary" />
                Knowledge Base
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="glass px-4 py-2 rounded-lg">
                <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Logged in as</div>
                <div className="text-sm text-white font-medium">{user?.email || 'Guest User'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative container mx-auto px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Info Card */}
          <Card className="mb-6 glass-strong border-purple-500/30 card-hover relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-cyan-500/5" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3 text-white text-xl">
                <div className="p-2 rounded-lg bg-gradient-primary glow-primary">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                Personal Knowledge Base
              </CardTitle>
              <CardDescription className="text-white/80 text-base leading-relaxed">
                Upload PDF documents and video/audio files to enhance your AI avatars' knowledge. 
                Your uploads are processed, embedded, and stored in a vector database for intelligent retrieval during conversations.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Main Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-8 glass p-1">
              <TabsTrigger 
                value="upload" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-upload"
              >
                <Upload className="w-4 h-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger 
                value="gdrive" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-gdrive"
              >
                <FolderOpen className="w-4 h-4" />
                Folders
              </TabsTrigger>
              <TabsTrigger 
                value="documents" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-documents"
              >
                <FileText className="w-4 h-4" />
                Docs
              </TabsTrigger>
              <TabsTrigger 
                value="namespaces" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-namespaces"
              >
                <Database className="w-4 h-4" />
                Pinecone
              </TabsTrigger>
              <TabsTrigger 
                value="mapping" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-mapping"
              >
                <Link2 className="w-4 h-4" />
                Mapping
              </TabsTrigger>
              <TabsTrigger 
                value="courses" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-courses"
              >
                <GraduationCap className="w-4 h-4" />
                Courses
              </TabsTrigger>
              <TabsTrigger 
                value="podcasts" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-podcasts"
              >
                <Mic className="w-4 h-4" />
                Podcasts
              </TabsTrigger>
              <TabsTrigger 
                value="artifacts" 
                className="gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
                data-testid="tab-artifacts"
              >
                <Brain className="w-4 h-4" />
                Artifacts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-6">
              <DocumentUpload onUploadComplete={handleUploadComplete} />
              
              <Card className="glass-strong border-white/10 card-hover overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-primary" />
                <CardHeader>
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center glow-primary">
                      <span className="text-white text-sm">✓</span>
                    </div>
                    How It Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-white/70">
                  <div className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold glow-primary transition-transform group-hover:scale-110">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">Upload Your Content</p>
                      <p className="text-white/60">Drop PDF documents or video/audio files (MP4, MOV, MP3, WAV, etc.)</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold glow-primary transition-transform group-hover:scale-110">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">Automatic Processing</p>
                      <p className="text-white/60">PDFs are text-extracted, videos are transcribed using OpenAI Whisper</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold glow-primary transition-transform group-hover:scale-110">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">Intelligent Chunking & Embedding</p>
                      <p className="text-white/60">Content is split into chunks and converted to vector embeddings</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold glow-primary transition-transform group-hover:scale-110">
                      4
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">Vector Database Storage</p>
                      <p className="text-white/60">Embeddings stored in Pinecone for semantic search during conversations</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold glow-primary transition-transform group-hover:scale-110">
                      5
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">Avatar Integration</p>
                      <p className="text-white/60">AI avatars can now reference your personal knowledge in conversations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gdrive" className="space-y-6">
              <TopicFolderUpload />
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <DocumentViewer />
            </TabsContent>

            <TabsContent value="namespaces" className="space-y-6">
              <PineconeNamespaceManager />
            </TabsContent>

            <TabsContent value="mapping" className="space-y-6">
              <AvatarNamespaceMatrix />
            </TabsContent>

            <TabsContent value="courses" className="space-y-6">
              <CourseIngestion />
            </TabsContent>

            <TabsContent value="podcasts" className="space-y-6">
              <PodcastIngestion />
              
              {/* Batch ZIP Upload Section */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Batch Upload (ZIP)</h3>
                </div>
                <BatchPodcastIngestion />
              </div>
            </TabsContent>

            <TabsContent value="artifacts" className="space-y-6">
              <LearningArtifactIngestion />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
