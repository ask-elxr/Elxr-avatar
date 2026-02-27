export function formatVideoTitle(params: {
  avatarName: string;
  topic: string;
  userName?: string;
  userId?: string;
  type: 'course' | 'chat';
}): string {
  const date = new Date().toISOString().slice(0, 10);
  const typeLabel = params.type === 'course' ? 'Course' : 'Chat';
  
  let userLabel = 'Guest';
  if (params.userName) {
    userLabel = params.userName.slice(0, 20);
  } else if (params.userId) {
    if (params.userId.startsWith('temp_') || params.userId.startsWith('webflow_')) {
      userLabel = 'Guest';
    } else if (params.userId.startsWith('ms_')) {
      userLabel = `Member-${params.userId.slice(3, 11)}`;
    } else {
      userLabel = `User-${params.userId.slice(0, 8)}`;
    }
  }
  
  const sanitizedTopic = params.topic
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 50);
  
  const sanitizedAvatar = params.avatarName
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 30);
  
  return `[${typeLabel}] ${sanitizedAvatar} - ${sanitizedTopic} - ${userLabel} - ${date}`;
}
