import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, Video, GripVertical, Loader2, Play, Sparkles, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Course, Lesson, InsertLesson } from "@shared/schema";

interface LessonWithVideo extends Lesson {
  video?: any;
}

interface CourseWithLessons extends Course {
  lessons?: LessonWithVideo[];
}

interface CourseBuilderPageProps {
  isEmbedded?: boolean;
  courseId?: string | null;
  preSelectedAvatarId?: string | null;
  onBack?: () => void;
}

export default function CourseBuilderPage(props: CourseBuilderPageProps = {}) {
  const { isEmbedded = false, courseId: propCourseId, preSelectedAvatarId, onBack } = props;
  const [, params] = useRoute("/course-builder/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const courseId = isEmbedded ? propCourseId : params?.id;
  const isEditing = !!courseId;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [lessons, setLessons] = useState<LessonWithVideo[]>([]);

  // Fetch avatars that can generate videos (have valid HeyGen IDs)
  const { data: avatars } = useQuery({
    queryKey: ["/api/avatars/video-capable"],
  });

  // Fetch course if editing
  const { data: course, isLoading: loadingCourse } = useQuery<CourseWithLessons>({
    queryKey: ["/api/courses", courseId],
    enabled: isEditing,
    refetchInterval: (query) => {
      // Poll every 5 seconds if any lesson is generating or processing
      const data = query.state.data as CourseWithLessons | undefined;
      const hasGenerating = data?.lessons?.some((l: any) => {
        const status = l.video?.status || l.status;
        return status === "generating" || status === "processing";
      });
      return hasGenerating ? 5000 : false;
    },
  });

  // Populate form when course data loads
  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setDescription(course.description || "");
      setAvatarId(course.avatarId);
      setLessons(course.lessons || []);
    }
  }, [course]);

  // Pre-select avatar when preSelectedAvatarId is provided
  useEffect(() => {
    if (preSelectedAvatarId && !isEditing) {
      setAvatarId(preSelectedAvatarId);
    }
  }, [preSelectedAvatarId, isEditing]);

  // Track previous lesson statuses to detect completion (keyed by lessonId)
  const prevLessonStatusesRef = useRef<Record<string, string>>({});
  
  // Notify when videos complete
  useEffect(() => {
    if (!course?.lessons) return;
    
    const newlyCompleted: string[] = [];
    const newStatuses: Record<string, string> = {};
    
    for (const lesson of course.lessons) {
      const currentStatus = lesson.video?.status || lesson.status;
      const prevStatus = prevLessonStatusesRef.current[lesson.id];
      
      // Detect transition from in-flight (generating/processing/queued) -> completed
      const wasInFlight = prevStatus === "generating" || prevStatus === "processing" || prevStatus === "queued";
      if (wasInFlight && currentStatus === "completed") {
        newlyCompleted.push(lesson.title);
      }
      
      // Build new statuses map (cloned, not mutating ref)
      newStatuses[lesson.id] = currentStatus;
    }
    
    // Show toast for newly completed videos
    if (newlyCompleted.length > 0) {
      toast({
        title: "Video Ready!",
        description: newlyCompleted.length === 1 
          ? `"${newlyCompleted[0]}" video has finished generating.`
          : `${newlyCompleted.length} videos have finished generating.`,
        duration: 8000,
      });
    }
    
    // Update ref with new status snapshot (replace, don't mutate)
    prevLessonStatusesRef.current = newStatuses;
  }, [course?.lessons, toast]);

  // Create course mutation
  const createCourseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/courses", "POST", data);
      return response.json();
    },
    onSuccess: (newCourse: Course) => {
      toast({
        title: "Course created!",
        description: "Your course has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      if (isEmbedded && onBack) {
        onBack();
      } else {
        setLocation(`/course-builder/${newCourse.id}`);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create course. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update course mutation
  const updateCourseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/courses/${courseId}`, "PUT", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Course updated!",
        description: "Your changes have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update course. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Add lesson mutation
  const addLessonMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/courses/${courseId}/lessons`, "POST", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lesson added!",
        description: "New lesson has been added to the course.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add lesson. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update lesson mutation
  const updateLessonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest(`/api/courses/lessons/${id}`, "PUT", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
    },
  });

  // Delete lesson mutation
  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const response = await apiRequest(`/api/courses/lessons/${lessonId}`, "DELETE", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lesson deleted",
        description: "Lesson has been removed from the course.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete lesson. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveCourse = () => {
    if (!title.trim()) {
      toast({
        title: "Validation error",
        description: "Course title is required.",
        variant: "destructive",
      });
      return;
    }

    if (!avatarId) {
      toast({
        title: "Validation error",
        description: "Please select an avatar instructor.",
        variant: "destructive",
      });
      return;
    }

    const courseData = {
      title,
      description,
      avatarId,
    };

    if (isEditing) {
      updateCourseMutation.mutate(courseData);
    } else {
      createCourseMutation.mutate(courseData);
    }
  };

  const handleAddLesson = () => {
    if (!courseId) {
      toast({
        title: "Save course first",
        description: "Please save the course before adding lessons.",
        variant: "destructive",
      });
      return;
    }

    const newLesson = {
      courseId,
      title: "New Lesson",
      script: "",
      order: lessons.length,
    };

    addLessonMutation.mutate(newLesson);
  };

  const handleUpdateLesson = (lessonId: string, field: string, value: any) => {
    // Update local state immediately for responsive UI
    setLessons((prevLessons) =>
      prevLessons.map((l) =>
        l.id === lessonId ? { ...l, [field]: value } : l
      )
    );
  };

  // Debounced save to backend
  const saveLesson = (lessonId: string, field: string, value: any) => {
    const updatedData = { [field]: value };
    updateLessonMutation.mutate({ id: lessonId, data: updatedData });
  };

  const handleDeleteLesson = (lessonId: string) => {
    if (confirm("Are you sure you want to delete this lesson?")) {
      deleteLessonMutation.mutate(lessonId);
    }
  };

  // Generate video mutation
  const generateVideoMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const response = await apiRequest(`/api/courses/lessons/${lessonId}/generate-video`, "POST", {});
      const data = await response.json();
      
      // Check for HeyGen trial limit error
      if (!response.ok) {
        if (data.code === "HEYGEN_TRIAL_LIMIT" || response.status === 429) {
          throw new Error("HEYGEN_TRIAL_LIMIT:" + (data.message || "Daily video limit reached"));
        }
        throw new Error(data.error || "Failed to start video generation");
      }
      
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Video generation started!",
        description: "Your video is being generated. This may take a few minutes.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
    },
    onError: (error: any) => {
      const errorMsg = error.message || "";
      
      // Check for HeyGen trial limit error
      if (errorMsg.includes("HEYGEN_TRIAL_LIMIT")) {
        toast({
          title: "Daily Video Limit Reached",
          description: "You've reached HeyGen's daily limit of 5 test videos. This resets at midnight UTC. Try using production avatars like Dexter, Ann, or June which don't have this limitation.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMsg || "Failed to start video generation.",
          variant: "destructive",
        });
      }
    },
  });

  const handleGenerateVideo = (lessonId: string, lessonScript: string) => {
    if (!lessonScript || lessonScript.trim().length === 0) {
      toast({
        title: "Script required",
        description: "Please add a script before generating video.",
        variant: "destructive",
      });
      return;
    }

    generateVideoMutation.mutate(lessonId);
  };

  // Track generation start times for progress calculation
  const [generationStartTimes, setGenerationStartTimes] = useState<Record<string, number>>({});
  
  // Track which lessons are currently generating and manage timestamps
  const prevLessonStatusRef = useRef<Record<string, string>>({});
  
  useEffect(() => {
    if (!lessons) return;
    
    const updates: Record<string, number | null> = {};
    
    lessons.forEach(lesson => {
      const currentStatus = lesson.video?.status || lesson.status;
      const prevStatus = prevLessonStatusRef.current[lesson.id];
      const isGenerating = currentStatus === "generating" || currentStatus === "processing";
      const wasGenerating = prevStatus === "generating" || prevStatus === "processing";
      
      if (isGenerating && !wasGenerating) {
        // Just started generating - set fresh timestamp
        updates[lesson.id] = Date.now();
      } else if (!isGenerating && wasGenerating) {
        // Just finished - clear timestamp so next run starts fresh
        updates[lesson.id] = null;
      }
      
      prevLessonStatusRef.current[lesson.id] = currentStatus;
    });
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      setGenerationStartTimes(prev => {
        const newTimes = { ...prev };
        Object.entries(updates).forEach(([id, time]) => {
          if (time === null) {
            delete newTimes[id];
          } else {
            newTimes[id] = time;
          }
        });
        return newTimes;
      });
    }
  }, [lessons]);
  
  // Force re-render every second for generating/processing lessons to update timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasGenerating = lessons?.some(l => {
      const status = l.video?.status || l.status;
      return status === "generating" || status === "processing";
    });
    if (hasGenerating) {
      const interval = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [lessons]);

  // AI Script Generation state
  const [scriptGenDialog, setScriptGenDialog] = useState<{
    open: boolean;
    lessonId: string;
    lessonTitle: string;
    topic: string;
    duration: number;
  }>({
    open: false,
    lessonId: '',
    lessonTitle: '',
    topic: '',
    duration: 60
  });
  const [generatingScriptFor, setGeneratingScriptFor] = useState<string | null>(null);

  // Generate script mutation
  const generateScriptMutation = useMutation({
    mutationFn: async (data: { lessonId: string; lessonTitle: string; topic: string; targetDuration: number }) => {
      const response = await apiRequest("/api/courses/generate-script", "POST", {
        avatarId,
        courseId,
        topic: data.topic,
        lessonTitle: data.lessonTitle,
        targetDuration: data.targetDuration
      });
      
      // Check for HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Script generation failed');
      }
      
      return { ...result, lessonId: data.lessonId };
    },
    onSuccess: (result) => {
      // Update the lesson script locally
      handleUpdateLesson(result.lessonId, 'script', result.script);
      // Save to backend
      updateLessonMutation.mutate({ id: result.lessonId, data: { script: result.script } });
      
      toast({
        title: "Script generated!",
        description: `Created ${result.metadata?.estimatedDuration || 60}s script using ${result.sources?.pinecone || 0} knowledge sources.`,
      });
      setGeneratingScriptFor(null);
      setScriptGenDialog(prev => ({ ...prev, open: false }));
    },
    onError: (error: any) => {
      toast({
        title: "Script generation failed",
        description: error.message || "Could not generate script. Please try again.",
        variant: "destructive",
      });
      setGeneratingScriptFor(null);
      setScriptGenDialog(prev => ({ ...prev, open: false }));
    },
  });

  const openScriptGenDialog = (lessonId: string, lessonTitle: string) => {
    setScriptGenDialog({
      open: true,
      lessonId,
      lessonTitle,
      topic: lessonTitle || '',
      duration: 60
    });
  };

  const handleGenerateScript = () => {
    if (!scriptGenDialog.topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for the script.",
        variant: "destructive",
      });
      return;
    }
    
    if (!avatarId) {
      toast({
        title: "Avatar required",
        description: "Please select an avatar instructor first.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingScriptFor(scriptGenDialog.lessonId);
    generateScriptMutation.mutate({
      lessonId: scriptGenDialog.lessonId,
      lessonTitle: scriptGenDialog.lessonTitle,
      topic: scriptGenDialog.topic,
      targetDuration: scriptGenDialog.duration
    });
  };

  const getVideoStatusDisplay = (lesson: LessonWithVideo) => {
    const videoStatus = lesson.video?.status || lesson.status;
    
    switch (videoStatus) {
      case "completed":
        return { text: "Video Ready", color: "text-green-400", icon: Play, isGenerating: false };
      case "generating":
      case "processing":
        // Use tracked start time or fallback to now (timer effect handles initial tracking)
        const startTime = generationStartTimes[lesson.id] || Date.now();
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Estimate progress (avg 3 min = 180 sec)
        const estimatedTotal = 180;
        const progress = Math.min((elapsedSeconds / estimatedTotal) * 100, 95);
        
        return { 
          text: `Generating Video...`, 
          color: "text-yellow-400", 
          icon: Loader2,
          subtitle: `Elapsed: ${timeStr} | Avg: 2-5 min`,
          isGenerating: true,
          progress,
          elapsedTime: timeStr
        };
      case "failed":
        const errorMsg = lesson.errorMessage || "Unknown error";
        return { text: "Failed", color: "text-red-400", icon: null, subtitle: errorMsg, isGenerating: false };
      default:
        return { text: "No Video", color: "text-gray-400", icon: null, isGenerating: false };
    }
  };

  if (isEditing && loadingCourse) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading course...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isEmbedded && onBack) {
                  onBack();
                } else {
                  setLocation("/courses");
                }
              }}
              className="text-gray-400 hover:text-white flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl font-satoshi font-bold truncate">
                {isEditing ? "Edit Course" : "Create Course"}
              </h1>
              <p className="text-gray-400 font-satoshi mt-1 text-sm sm:text-base">
                Build structured lessons with AI avatar instructors
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveCourse}
            disabled={createCourseMutation.isPending || updateCourseMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700 font-satoshi w-full sm:w-auto"
          >
            <Save className="w-4 h-4 mr-2" />
            {isEditing ? "Save Changes" : "Create Course"}
          </Button>
        </div>

        {/* Course Details */}
        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader>
            <CardTitle className="text-white font-satoshi">Course Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-gray-300 font-satoshi">
                Course Title *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Introduction to Mindfulness"
                className="bg-gray-800 border-gray-700 text-white font-satoshi"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-300 font-satoshi">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your course..."
                className="bg-gray-800 border-gray-700 text-white font-satoshi min-h-[100px]"
              />
            </div>

            <div>
              <Label htmlFor="avatar" className="text-gray-300 font-satoshi">
                Avatar Instructor *
              </Label>
              <Select value={avatarId} onValueChange={setAvatarId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white font-satoshi">
                  <SelectValue placeholder="Select an avatar" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {Array.isArray(avatars) && avatars.map((avatar: any) => (
                    <SelectItem
                      key={avatar.id}
                      value={avatar.id}
                      className="text-white font-satoshi"
                    >
                      {avatar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Lessons Section */}
        {isEditing && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="px-3 sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-white font-satoshi text-lg sm:text-xl">Lessons</CardTitle>
                <Button
                  onClick={handleAddLesson}
                  disabled={addLessonMutation.isPending}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 font-satoshi text-xs sm:text-sm flex-shrink-0"
                >
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Lesson</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {!lessons || lessons.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-satoshi">
                  <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm sm:text-base">No lessons yet. Click the + button to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lessons.map((lesson, index) => (
                    <Card key={lesson.id} className="bg-gray-800 border-gray-700 relative">
                      <CardContent className="p-3 sm:pt-6 sm:px-6">
                        <div className="flex items-start gap-2 sm:gap-4 pr-8 sm:pr-0">
                          <div className="hidden sm:block flex-shrink-0 mt-2">
                            <GripVertical className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-3">
                            <div>
                              <Label className="text-gray-300 font-satoshi text-sm">
                                Lesson {index + 1} Title
                              </Label>
                              <Input
                                value={lesson.title}
                                onChange={(e) =>
                                  handleUpdateLesson(lesson.id, "title", e.target.value)
                                }
                                onBlur={(e) =>
                                  saveLesson(lesson.id, "title", e.target.value)
                                }
                                className="bg-gray-900 border-gray-600 text-white font-satoshi"
                              />
                            </div>
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-1">
                                <Label className="text-gray-300 font-satoshi text-xs sm:text-sm">
                                  Script
                                </Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 gap-1.5 h-7 px-2 self-start sm:self-auto"
                                  onClick={() => openScriptGenDialog(lesson.id, lesson.title)}
                                  disabled={generatingScriptFor === lesson.id}
                                  data-testid={`button-generate-script-${lesson.id}`}
                                >
                                  {generatingScriptFor === lesson.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span className="text-xs">Generating...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5" />
                                      <span className="text-xs">Generate with AI</span>
                                    </>
                                  )}
                                </Button>
                              </div>
                              <Textarea
                                value={lesson.script}
                                onChange={(e) =>
                                  handleUpdateLesson(lesson.id, "script", e.target.value)
                                }
                                onBlur={(e) =>
                                  saveLesson(lesson.id, "script", e.target.value)
                                }
                                placeholder="Enter the lesson script or click 'Generate with AI' to create one..."
                                className="bg-gray-900 border-gray-600 text-white font-satoshi min-h-[120px]"
                              />
                            </div>

                            {/* Video Generation Status and Button */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-700">
                              <div className="flex flex-col gap-2 flex-1 max-w-md">
                                {(() => {
                                  const status = getVideoStatusDisplay(lesson);
                                  const Icon = status.icon;
                                  return (
                                    <>
                                      <div className="flex items-center gap-2">
                                        {Icon && (
                                          <Icon
                                            className={`w-4 h-4 ${status.color} ${
                                              status.isGenerating ? "animate-spin" : ""
                                            }`}
                                          />
                                        )}
                                        <span className={`text-xs sm:text-sm font-satoshi ${status.color}`}>
                                          {status.text}
                                        </span>
                                        {status.elapsedTime && (
                                          <span className="text-xs font-satoshi text-purple-400 font-mono bg-purple-900/30 px-2 py-0.5 rounded">
                                            {status.elapsedTime}
                                          </span>
                                        )}
                                      </div>
                                      {status.isGenerating && status.progress !== undefined && (
                                        <div className="w-full">
                                          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 transition-all duration-300 animate-pulse"
                                              style={{ width: `${status.progress}%` }}
                                            />
                                          </div>
                                          <p className="text-xs text-gray-500 mt-1 font-satoshi">
                                            {status.subtitle}
                                          </p>
                                        </div>
                                      )}
                                      {!status.isGenerating && status.subtitle && (
                                        <span className="text-xs font-satoshi text-gray-500">
                                          {status.subtitle}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Video Thumbnail */}
                              {lesson.video?.thumbnailUrl && (
                                <div className="my-2 sm:my-3 w-full sm:w-auto">
                                  <div className="relative group">
                                    <img 
                                      src={lesson.video.thumbnailUrl}
                                      alt={lesson.title}
                                      className="w-full sm:w-48 h-32 sm:h-40 object-cover rounded border border-purple-600/30"
                                    />
                                    {lesson.video?.videoUrl && (
                                      <Button
                                        size="sm"
                                        className="absolute inset-0 m-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-600/90 hover:bg-green-600 border-2 border-white opacity-90 hover:opacity-100 transition-opacity"
                                        onClick={() => window.open(lesson.video.videoUrl, "_blank")}
                                      >
                                        <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
                                      </Button>
                                    )}
                                    {lesson.video?.duration && (
                                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                                        {lesson.video.duration}s
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2 flex-wrap">
                                {lesson.video?.videoUrl && !lesson.video?.thumbnailUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(lesson.video.videoUrl, "_blank")}
                                    className="bg-green-950/20 border-green-600 text-green-400 hover:bg-green-950/40 font-satoshi text-xs sm:text-sm"
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    Play
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  onClick={() => handleGenerateVideo(lesson.id, lesson.script)}
                                  disabled={
                                    generateVideoMutation.isPending ||
                                    lesson.status === "generating" ||
                                    lesson.video?.status === "generating"
                                  }
                                  className="bg-purple-600 hover:bg-purple-700 font-satoshi text-xs sm:text-sm"
                                >
                                  <Video className="w-3 h-3 mr-1" />
                                  {lesson.status === "generating" ||
                                  lesson.video?.status === "generating"
                                    ? "..."
                                    : lesson.video?.videoUrl
                                    ? "Regenerate"
                                    : "Generate"}
                                </Button>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLesson(lesson.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20 flex-shrink-0 absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Script Generation Dialog */}
      <Dialog open={scriptGenDialog.open} onOpenChange={(open) => setScriptGenDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-[95vw] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="font-satoshi flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              Generate Script with AI
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">
              Generate a lesson script using the avatar's knowledge base.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Topic / Subject</Label>
              <Input
                value={scriptGenDialog.topic}
                onChange={(e) => setScriptGenDialog(prev => ({ ...prev, topic: e.target.value }))}
                placeholder="e.g., Benefits of meditation for stress relief"
                className="bg-gray-800 border-gray-600 text-white"
                data-testid="input-script-topic"
              />
              <p className="text-xs text-gray-500">
                Be specific - this helps the AI find relevant knowledge from the database.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-gray-300">Target Duration (seconds)</Label>
              <Select 
                value={String(scriptGenDialog.duration)} 
                onValueChange={(val) => setScriptGenDialog(prev => ({ ...prev, duration: parseInt(val) }))}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="30" className="text-white">30 seconds (~75 words)</SelectItem>
                  <SelectItem value="60" className="text-white">60 seconds (~150 words)</SelectItem>
                  <SelectItem value="90" className="text-white">90 seconds (~225 words)</SelectItem>
                  <SelectItem value="120" className="text-white">2 minutes (~300 words)</SelectItem>
                  <SelectItem value="180" className="text-white">3 minutes (~450 words)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setScriptGenDialog(prev => ({ ...prev, open: false }))}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateScript}
              disabled={generateScriptMutation.isPending || !scriptGenDialog.topic.trim()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              data-testid="button-confirm-generate-script"
            >
              {generateScriptMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Script
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
