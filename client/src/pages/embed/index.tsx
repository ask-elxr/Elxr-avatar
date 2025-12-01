import Dashboard, { type UserView } from "../Dashboard";

type EmbedView = Exclude<UserView, "active-chat">;

interface EmbedPageProps {
  view: EmbedView;
  avatarId?: string;
  courseId?: string;
}

export default function EmbedPage({ view, avatarId, courseId }: EmbedPageProps) {
  return (
    <Dashboard 
      isEmbed={true} 
      embedView={view} 
      embedAvatarId={avatarId}
      embedCourseId={courseId}
    />
  );
}
