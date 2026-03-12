import { useState, useEffect } from "react";
import Dashboard, { type UserView } from "../Dashboard";
import { getMemberstackId } from "@/lib/queryClient";

type EmbedView = Exclude<UserView, "active-chat">;

interface EmbedPageProps {
  view: EmbedView;
  avatarId?: string;
  courseId?: string;
}

export default function EmbedPage({ view, avatarId, courseId }: EmbedPageProps) {
  const [ready, setReady] = useState(() => !!getMemberstackId());

  useEffect(() => {
    if (ready) return;

    // Poll localStorage for member_id (may arrive from sibling iframe or postMessage)
    const interval = setInterval(() => {
      if (getMemberstackId()) {
        setReady(true);
        clearInterval(interval);
      }
    }, 200);

    // Timeout after 2s — proceed without auth (anonymous)
    const timeout = setTimeout(() => {
      setReady(true);
      clearInterval(interval);
    }, 2000);

    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Dashboard
      isEmbed={true}
      embedView={view}
      embedAvatarId={avatarId}
      embedCourseId={courseId}
    />
  );
}
