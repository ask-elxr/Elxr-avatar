import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Video, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@shared/schema";

export default function CoursesPage() {
  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: avatars } = useQuery({
    queryKey: ["/api/avatars"],
  });

  const getAvatarName = (avatarId: string) => {
    const avatar = avatars?.find((a: any) => a.id === avatarId);
    return avatar?.name || avatarId;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'generating': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'draft': return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'failed': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading courses...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-satoshi font-bold mb-2">Video Courses</h1>
            <p className="text-gray-400 font-satoshi">
              Create AI-generated courses with your avatar instructors
            </p>
          </div>
          <Link href="/course-builder">
            <Button className="bg-purple-600 hover:bg-purple-700 font-satoshi">
              <Plus className="w-4 h-4 mr-2" />
              New Course
            </Button>
          </Link>
        </div>

        {/* Courses Grid */}
        {!courses || courses.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Video className="w-16 h-16 text-gray-600 mb-4" />
              <h3 className="text-xl font-satoshi mb-2">No courses yet</h3>
              <p className="text-gray-400 font-satoshi mb-6 text-center max-w-md">
                Start creating video courses with AI avatars. Build structured lessons and generate professional videos automatically.
              </p>
              <Link href="/course-builder">
                <Button className="bg-purple-600 hover:bg-purple-700 font-satoshi">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Course
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Link key={course.id} href={`/course-builder/${course.id}`}>
                <Card className="bg-gray-900 border-gray-800 hover:border-purple-600 transition-all cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <CardTitle className="text-white font-satoshi line-clamp-2">
                        {course.title}
                      </CardTitle>
                      <Badge className={`${getStatusColor(course.status)} border font-satoshi text-xs`}>
                        {course.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-gray-400 font-satoshi line-clamp-2">
                      {course.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-gray-400 font-satoshi">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{getAvatarName(course.avatarId)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        <span>{course.totalLessons || 0} lessons</span>
                      </div>
                      {course.totalDuration > 0 && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(course.totalDuration)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
