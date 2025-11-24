import { lazy, Suspense } from "react";

const CourseBuilderPage = lazy(() => import("@/pages/course-builder"));

interface CourseBuilderComponentProps {
  courseId?: string | null;
  onBack: () => void;
}

export function CourseBuilderComponent({ courseId, onBack }: CourseBuilderComponentProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <CourseBuilderPage isEmbedded courseId={courseId} onBack={onBack} />
    </Suspense>
  );
}
