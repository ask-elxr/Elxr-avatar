import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, Video, GripVertical, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Course, Lesson, InsertLesson } from "@shared/schema";

interface LessonWithVideo extends Lesson {
  video?: any;
}

interface CourseWithLessons extends Course {
  lessons?: LessonWithVideo[];
}

export default function CourseBuilderPage() {
  const [, params] = useRoute("/course-builder/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const courseId = params?.id;
  const isEditing = !!courseId;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [lessons, setLessons] = useState<LessonWithVideo[]>([]);

  // Fetch avatars
  const { data: avatars } = useQuery({
    queryKey: ["/api/avatars"],
  });

  // Fetch course if editing
  const { data: course, isLoading: loadingCourse } = useQuery<CourseWithLessons>({
    queryKey: ["/api/courses", courseId],
    enabled: isEditing,
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
      setLocation(`/course-builder/${newCourse.id}`);
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
    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson) {
      const updatedData = { [field]: value };
      updateLessonMutation.mutate({ id: lessonId, data: updatedData });
    }
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
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Video generation started!",
        description: "Your video is being generated. This may take a few minutes.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start video generation.",
        variant: "destructive",
      });
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

  const getVideoStatusDisplay = (lesson: LessonWithVideo) => {
    const videoStatus = lesson.video?.status || lesson.status;
    
    switch (videoStatus) {
      case "completed":
        return { text: "Video Ready", color: "text-green-400", icon: Play };
      case "generating":
      case "processing":
        return { text: "Generating...", color: "text-yellow-400", icon: Loader2 };
      case "failed":
        return { text: "Failed", color: "text-red-400", icon: null };
      default:
        return { text: "No Video", color: "text-gray-400", icon: null };
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
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation("/courses")}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-satoshi font-bold">
                {isEditing ? "Edit Course" : "Create Course"}
              </h1>
              <p className="text-gray-400 font-satoshi mt-1">
                Build structured lessons with AI avatar instructors
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveCourse}
            disabled={createCourseMutation.isPending || updateCourseMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700 font-satoshi"
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
                  {avatars?.map((avatar: any) => (
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
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white font-satoshi">Lessons</CardTitle>
                <Button
                  onClick={handleAddLesson}
                  disabled={addLessonMutation.isPending}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 font-satoshi"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Lesson
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!lessons || lessons.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-satoshi">
                  <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No lessons yet. Click "Add Lesson" to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lessons.map((lesson, index) => (
                    <Card key={lesson.id} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 mt-2">
                            <GripVertical className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <Label className="text-gray-300 font-satoshi text-sm">
                                Lesson {index + 1} Title
                              </Label>
                              <Input
                                value={lesson.title}
                                onChange={(e) =>
                                  handleUpdateLesson(lesson.id, "title", e.target.value)
                                }
                                className="bg-gray-900 border-gray-600 text-white font-satoshi"
                              />
                            </div>
                            <div>
                              <Label className="text-gray-300 font-satoshi text-sm">
                                Script (What the avatar will say)
                              </Label>
                              <Textarea
                                value={lesson.script}
                                onChange={(e) =>
                                  handleUpdateLesson(lesson.id, "script", e.target.value)
                                }
                                placeholder="Enter the lesson script..."
                                className="bg-gray-900 border-gray-600 text-white font-satoshi min-h-[120px]"
                              />
                            </div>

                            {/* Video Generation Status and Button */}
                            <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const status = getVideoStatusDisplay(lesson);
                                  const Icon = status.icon;
                                  return (
                                    <>
                                      {Icon && (
                                        <Icon
                                          className={`w-4 h-4 ${status.color} ${
                                            status.text === "Generating..." ? "animate-spin" : ""
                                          }`}
                                        />
                                      )}
                                      <span className={`text-sm font-satoshi ${status.color}`}>
                                        {status.text}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>

                              <div className="flex gap-2">
                                {lesson.video?.videoUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(lesson.video.videoUrl, "_blank")}
                                    className="bg-green-950/20 border-green-600 text-green-400 hover:bg-green-950/40 font-satoshi"
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
                                  className="bg-purple-600 hover:bg-purple-700 font-satoshi"
                                >
                                  <Video className="w-3 h-3 mr-1" />
                                  {lesson.status === "generating" ||
                                  lesson.video?.status === "generating"
                                    ? "Generating..."
                                    : lesson.video?.videoUrl
                                    ? "Regenerate"
                                    : "Generate Video"}
                                </Button>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLesson(lesson.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
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
    </div>
  );
}
