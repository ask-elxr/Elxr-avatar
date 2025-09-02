import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Link, Type, Mic, MicOff, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadResult {
  success: boolean;
  documentId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: string;
  message: string;
}

export function DocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload PDF, DOCX, or TXT files only.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload files smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('document', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadResults(prev => [result, ...prev]);
        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded and is being processed.`,
        });
      } else {
        toast({
          title: "Upload failed",
          description: result.error || "Failed to upload document.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the document.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset the input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // URL Upload Handler
  const handleUrlUpload = async () => {
    if (!urlInput.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a valid URL.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch('/api/documents/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });

      const result = await response.json();
      if (result.success) {
        setUploadResults(prev => [result, ...prev]);
        setUrlInput('');
        toast({
          title: "URL processed",
          description: `Content from ${urlInput} has been added to the knowledge base.`,
        });
      } else {
        toast({
          title: "URL processing failed",
          description: result.error || "Failed to process the URL.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('URL upload error:', error);
      toast({
        title: "URL processing failed",
        description: "An error occurred while processing the URL.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Text Upload Handler
  const handleTextUpload = async () => {
    if (!textInput.trim()) {
      toast({
        title: "Text required",
        description: "Please enter some text to upload.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch('/api/documents/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput, title: 'Custom Text Input' }),
      });

      const result = await response.json();
      if (result.success) {
        setUploadResults(prev => [result, ...prev]);
        setTextInput('');
        toast({
          title: "Text uploaded",
          description: "Your text has been added to the knowledge base.",
        });
      } else {
        toast({
          title: "Text upload failed",
          description: result.error || "Failed to upload text.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Text upload error:', error);
      toast({
        title: "Text upload failed",
        description: "An error occurred while uploading text.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Dictation/Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        processRecording(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Speak now. Click stop when finished.",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const processRecording = async (audioBlob: Blob) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');

      const response = await fetch('/api/documents/dictation', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setUploadResults(prev => [result, ...prev]);
        toast({
          title: "Recording processed",
          description: "Your voice recording has been transcribed and added to the knowledge base.",
        });
      } else {
        toast({
          title: "Recording processing failed",
          description: result.error || "Failed to process the recording.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Recording processing error:', error);
      toast({
        title: "Recording processing failed",
        description: "An error occurred while processing the recording.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="urls" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            URLs
          </TabsTrigger>
          <TabsTrigger value="text" className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            Text
          </TabsTrigger>
          <TabsTrigger value="dictation" className="flex items-center gap-2">
            <Mic className="w-4 h-4" />
            Voice
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Documents
              </CardTitle>
              <CardDescription>
                Upload PDF, DOCX, or TXT files to add knowledge to your AI avatar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="document">Choose Document</Label>
                  <Input
                    id="document"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="mt-1"
                    data-testid="input-document-upload"
                  />
                </div>
                
                {isUploading && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing document...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="urls" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="w-5 h-5" />
                Add URLs
              </CardTitle>
              <CardDescription>
                Add web pages and articles by entering their URLs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="url">Website URL</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com/article"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    disabled={isUploading}
                    className="mt-1"
                    data-testid="input-url"
                  />
                </div>
                
                <Button 
                  onClick={handleUrlUpload} 
                  disabled={!urlInput.trim() || isUploading}
                  className="w-full"
                  data-testid="button-upload-url"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing URL...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 mr-2" />
                      Add URL Content
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="text" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="w-5 h-5" />
                Add Text
              </CardTitle>
              <CardDescription>
                Directly enter text content to add to the knowledge base.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="text-content">Text Content</Label>
                  <Textarea
                    id="text-content"
                    placeholder="Enter your text content here..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    disabled={isUploading}
                    className="mt-1 min-h-[200px]"
                    data-testid="textarea-text-input"
                  />
                </div>
                
                <Button 
                  onClick={handleTextUpload} 
                  disabled={!textInput.trim() || isUploading}
                  className="w-full"
                  data-testid="button-upload-text"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing text...
                    </>
                  ) : (
                    <>
                      <Type className="w-4 h-4 mr-2" />
                      Add Text Content
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dictation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Voice Recording
              </CardTitle>
              <CardDescription>
                Record voice messages that will be transcribed and added to the knowledge base.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center space-y-4">
                  {isRecording && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center justify-center gap-2 text-red-600 mb-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        Recording: {formatTime(recordingTime)}
                      </div>
                      <p className="text-sm text-red-600">Speak clearly into your microphone</p>
                    </div>
                  )}
                  
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isUploading}
                    size="lg"
                    className={`w-full ${isRecording ? 'bg-red-600 hover:bg-red-700' : ''}`}
                    data-testid="button-record-toggle"
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="w-5 h-5 mr-2" />
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5 mr-2" />
                        Start Recording
                      </>
                    )}
                  </Button>

                  {isUploading && (
                    <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribing and processing audio...
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {uploadResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload History</CardTitle>
            <CardDescription>
              Recent uploads and their processing status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadResults.map((result, index) => (
                <div
                  key={`${result.documentId}-${index}`}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <p className="font-medium text-sm">{result.filename}</p>
                      <p className="text-xs text-gray-500">
                        {typeof result.fileSize === 'number' ? formatFileSize(result.fileSize) : result.fileSize} • {result.status}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {result.documentId}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}