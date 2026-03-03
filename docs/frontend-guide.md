# Frontend Guide

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.3 | Type safety |
| Vite | 5.4.19 | Bundler + dev server |
| wouter | 3.3.5 | Client-side routing |
| TanStack React Query | 5.60.5 | Server state management |
| Tailwind CSS | 3.4.17 | Utility-first styling |
| shadcn/ui | new-york style | Component library (Radix-based) |
| Framer Motion | 11.13.1 | Animations |
| recharts | 2.15.4 | Charts |
| lucide-react | 0.453.0 | Icons |
| react-hook-form | + zod | Form validation |

## Entry Points

- `client/index.html` — HTML shell, PWA meta, font preloads
- `client/src/main.tsx` — React root mount
- `client/src/App.tsx` — Provider tree + router
- `client/src/index.css` — Global styles, CSS custom properties, Tailwind imports

## Routing (wouter)

All pages are lazy-loaded via `React.lazy()` + `<Suspense>`.

### Main Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Dashboard | Main app shell |
| `/landing` | Landing | Marketing page |
| `/avatar-select` | AvatarSelect | Choose avatar, start trial |
| `/chat` | Home | Legacy chat entry |
| `/dashboard` | Dashboard | App shell |
| `/dashboard/chat` | Dashboard | Chat view |
| `/dashboard/chat/:avatarId` | Dashboard | Chat with specific avatar |
| `/dashboard/mentors` | Dashboard | Mentors view |
| `/dashboard/mentors/:avatarId` | Dashboard | Specific mentor |
| `/dashboard/videos` | Dashboard | Video library |
| `/dashboard/courses` | Dashboard | Courses list |
| `/dashboard/courses/:courseId` | Dashboard | Course detail |
| `/dashboard/courses/:courseId/edit` | Dashboard | Course editor |
| `/dashboard/mood` | Dashboard | Mood tracker |
| `/dashboard/plan` | Dashboard | Learning plan |
| `/dashboard/credits` | Dashboard | Credit balance |
| `/dashboard/settings` | Dashboard | User settings |
| `/admin` | Admin | Admin panel |
| `/admin-login` | AdminLogin | Admin secret entry |
| `/analytics` | Analytics | Usage analytics |
| `/courses` | Courses | Course listing |
| `/course-builder/:id` | CourseBuilder | Course creation |
| `/knowledge-base` | KnowledgeBase | KB manager |
| `/credits` | Credits | Credits page |
| `/account` | Account | User settings |

### Embed Routes (Webflow iframes)

All `/embed/*` routes render the same Dashboard/Admin components with `isEmbed={true}`:

| Path | View |
|------|------|
| `/embed/dashboard` | Dashboard |
| `/embed/chat` | Chat |
| `/embed/chat/:avatarId` | Chat with avatar |
| `/embed/videos` | Videos |
| `/embed/courses` | Courses |
| `/embed/mood` | Mood |
| `/embed/plan` | Plan |
| `/embed/credits` | Credits |
| `/embed/settings` | Settings |
| `/embed/admin` | Admin |
| `/embed/admin/avatars` | Admin avatars |
| `/embed/admin/knowledge` | Admin knowledge |
| `/embed/admin/courses` | Admin courses |
| `/embed/admin/users` | Admin users |
| `/embed/admin/analytics` | Admin analytics |
| `/embed/admin/credits` | Admin credits |

### Subdomain Detection
On mount, if `window.location.hostname` starts with `admin.`, the user is redirected to `/admin-login`.

## Key Pages

### Dashboard (`client/src/pages/Dashboard.tsx`, ~153KB)
The main app shell. Handles sidebar navigation and all sub-views using a `UserView` type union to switch content. Powers both standalone and embed modes.

### Admin (`client/src/pages/admin.tsx`, ~65KB)
Full admin control panel with sections: dashboard, avatars, knowledge, courses, users, analytics, credits. Requires admin secret (stored in localStorage).

### Home (`client/src/pages/home.tsx`)
Legacy chat entry page. Checks subscription, validates avatar access, shows disclaimer, then renders `<AvatarChat>`.

## Key Components

### Core Chat
| Component | File | Description |
|-----------|------|-------------|
| AvatarChat | `components/avatar-chat.tsx` (~90KB) | Core interactive chat UI. Orchestrates video display, voice input, text input, mode switching, volume, fullscreen, chroma key. |
| StreamingAvatar | `components/streaming-avatar.tsx` | Standalone HeyGen SDK wrapper (test pages) |
| AudioOnlyDisplay | `components/AudioOnlyDisplay.tsx` | Audio-only mode UI with imperative ref |
| AudioVideoToggle | `components/AudioVideoToggle.tsx` | Toggle between `'video'`, `'audio'`, `'text'` modes |
| ElevenLabsConversation | `components/ElevenLabsConversation.tsx` | ElevenLabs conversational widget |

### Avatar Management
| Component | File | Description |
|-----------|------|-------------|
| AvatarManager | `components/AvatarManager.tsx` (~76KB) | Admin: full avatar CRUD |
| AvatarSelector | `components/avatar-selector.tsx` | Avatar picker |
| AvatarSwitcher | `components/AvatarSwitcher.tsx` | Switch avatar mid-session |
| AvatarPreview | `components/AvatarPreview.tsx` | Preview before starting |
| AvatarPineconeStatus | `components/AvatarPineconeStatus.tsx` | Namespace status |
| AvatarNamespaceMatrix | `components/AvatarNamespaceMatrix.tsx` | Matrix view of avatars x namespaces |

### Knowledge / Ingestion (Admin)
| Component | File | Description |
|-----------|------|-------------|
| TopicFolderUpload | `components/TopicFolderUpload.tsx` (~49KB) | Google Drive topic ingestion |
| LearningArtifactIngestion | `components/LearningArtifactIngestion.tsx` (~39KB) | Course transcript → artifacts |
| BatchPodcastIngestion | `components/BatchPodcastIngestion.tsx` (~32KB) | ZIP podcast batch upload |
| PodcastIngestion | `components/PodcastIngestion.tsx` | Single podcast ingestion |
| CourseIngestion | `components/CourseIngestion.tsx` | Course ingestion |
| DocumentUpload | `components/DocumentUpload.tsx` | Document upload |
| GoogleDrivePicker | `components/GoogleDrivePicker.tsx` | Google Drive file picker |

### UI Components (`components/ui/`)
40+ shadcn/ui components: accordion, alert, badge, button, card, dialog, dropdown-menu, form, input, select, sheet, sidebar, table, tabs, toast, tooltip, etc.

## Custom Hooks

| Hook | File | Description |
|------|------|-------------|
| `useAuth` | `hooks/useAuth.ts` | Fetches `/api/auth/user`. In embed mode, returns mock guest. |
| `useAuthSync` | `hooks/useAuthSync.ts` | Cross-tab logout sync via BroadcastChannel + 30s heartbeat |
| `useAnonymousUser` | `hooks/useAnonymousUser.ts` | Generates/persists anonymous UUID |
| `useAvatarSession` | `hooks/useAvatarSession.ts` | **Largest hook (~800+ lines)**. Full avatar session lifecycle: start/stop, voice recognition, audio playback, mode switching, barge-in, echo suppression, muting. |
| `useConversationWs` | `hooks/useConversationWs.ts` | WebSocket for bidirectional PCM audio streaming |
| `useStreamingChat` | `hooks/useStreamingChat.ts` | WebSocket for streaming LLM text + audio |
| `useWebRTCStreaming` | `hooks/useWebRTCStreaming.ts` | LiveKit WebRTC room connection |
| `useElevenLabsSTT` | `hooks/useElevenLabsSTT.ts` | ElevenLabs STT WebSocket, captures mic via ScriptProcessorNode |
| `useMobileSTT` | `hooks/useMobileSTT.ts` | Mobile push-to-talk via MediaRecorder |
| `useChromaKey` | `hooks/useChromaKey.ts` | Canvas-based green screen removal |
| `useFullscreen` | `hooks/useFullscreen.ts` | 3-tier fullscreen: native API → iOS video → CSS pseudo-fullscreen |
| `useInactivityTimer` | `hooks/useInactivityTimer.ts` | 45s warning + 15s grace → auto-end session |
| `useStreamStats` | `hooks/useStreamStats.ts` | Polls RTCPeerConnection for FPS, bitrate, audio level |
| `useChatVideoNotifications` | `hooks/useChatVideoNotifications.ts` | Polls for completed chat videos, fires toasts |
| `useCourseVideoNotifications` | `hooks/useCourseVideoNotifications.ts` | Same for course videos |
| `use-mobile` | `hooks/use-mobile.tsx` | Returns `isMobile` boolean from viewport width |
| `use-toast` | `hooks/use-toast.ts` | shadcn toast primitive |

### Session Drivers (`hooks/sessionDrivers.ts`)
Abstracts video/audio platform behind a `SessionDriver` interface:

| Driver | Platform | When used |
|--------|----------|-----------|
| `LiveAvatarDriver` | HeyGen LiveAvatar SDK + LiveKit | Primary: `streaming_platform === 'liveavatar'` |
| `HeyGenStreamingDriver` | HeyGen Streaming Avatar SDK | Legacy: `streaming_platform === 'heygen'` |
| `AudioOnlyDriver` | No video, audio only | When user selects audio-only mode |

## State Management

### TanStack React Query
Primary mechanism for server state. Configured in `client/src/lib/queryClient.ts`:

```typescript
staleTime: Infinity     // Data never auto-refreshes
refetchOnWindowFocus: false
retry: false
```

Invalidate manually: `queryClient.invalidateQueries({ queryKey: ['/api/...'] })`

### localStorage Keys
| Key | Purpose |
|-----|---------|
| `memberstack_id` | Memberstack user ID (Webflow) |
| `admin_secret` | Admin panel authentication |
| `anonymous-user-id` | Anonymous user UUID |
| `disclaimer-accepted` | Legal disclaimer |
| `mum-mode` | Memory mode toggle |
| `avatar-volume` | Global volume |
| `temp-user-id` | Legacy temp user ID |
| `seen-video-notifications` | Notification deduplication |

### API Client
`client/src/lib/queryClient.ts` exports:

- `apiRequest(url, method, data?)` — Fetch wrapper that adds auth headers (`X-Member-Id`, `X-Admin-Secret`) and `credentials: 'include'`
- `getQueryFn({ on401 })` — Factory for React Query `queryFn`
- `buildAuthenticatedWsUrl(path)` — WebSocket URL with auth params

## Styling

### Tailwind CSS + CSS Custom Properties
- **Dark mode only** (class-based, always active)
- Background: near-black (`hsl(240, 10%, 4%)`)
- Primary/Accent: purple (`hsl(271, 91%, 65%)`)
- All colors reference CSS variables (`var(--*)`)
- Font: Satoshi (from Fontshare CDN), custom `font-satoshi` class
- `cn()` utility: `clsx` + `tailwind-merge` for conditional classes

### shadcn/ui Configuration
- Style: `new-york`
- Base color: `neutral`
- CSS variables: enabled
- Border radius: `12px` (from `--radius`)
- Config: `components.json`

### Plugins
- `tailwindcss-animate` — Motion utilities
- `@tailwindcss/typography` — Prose content styling

## Web Worker

`client/src/workers/sessionStart.worker.ts` — Handles `/api/session/start` on iOS Safari as a workaround for main thread throttling after user gestures.
