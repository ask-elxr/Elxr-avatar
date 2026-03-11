# Image Upload Bug Analysis — 2026-03-11

## Problem
Image uploading in avatar chat is not working. Users can attach images (UI works correctly), but the image data never reaches the backend or Claude AI.

## Root Cause
Both audio and video modes now use the conversation WebSocket as the primary communication path (`useConversationWsModeRef.current = true`). The WebSocket path **completely ignores image data** — it only sends the text message and returns early, silently dropping any attached image.

The image data is lost at three layers:

### Layer 1: Client — `useAvatarSession.ts` (line 2729-2732)
```typescript
if (useConversationWsModeRef.current && conversationWs.isConnected) {
  conversationWs.sendText(message); // imageData parameter is IGNORED
  return; // Early return — image never processed
}
```
The `handleSubmitMessage` function receives `imageData` but never passes it to `sendText`.

### Layer 2: Client — `useConversationWs.ts` (line 339-343)
```typescript
const sendText = useCallback((text: string) => {
  wsRef.current.send(JSON.stringify({ type: 'SEND_TEXT', text }));
}, []);
```
The `sendText` function has no image parameter — it only sends `{ type: 'SEND_TEXT', text }`.

### Layer 3: Server — `conversationWsService.ts` (line 981-993 & 403-606)
- The `SEND_TEXT` handler only extracts `message.text`
- `runTurn(session, text)` only accepts a string message, no image params
- The `claudeService.streamResponse()` call (line 597-606) passes `undefined` for both `imageBase64` and `imageMimeType`

## What Works
- **Image UI**: File picker, drag-and-drop, preview, validation (type + 5MB limit) all work
- **Base64 encoding**: Image is correctly converted to base64 in `processImageFile()`
- **Non-WS paths**: The `/api/audio` and `/api/avatar/response/stream-audio` REST endpoints DO support images — but these are fallback paths that are no longer used
- **Claude service**: `claudeService.streamResponse()` and `generateEnhancedResponse()` both support multimodal (image + text) messages correctly

## Fix Required
Thread image data through the WebSocket pipeline:

1. **`client/src/hooks/useConversationWs.ts`** — Extend `sendText` to accept and serialize image data
2. **`client/src/hooks/useAvatarSession.ts`** — Pass `imageData` to `conversationWs.sendText()` in the WS path
3. **`server/conversationWsService.ts`** — Extract image from WS message, add params to `runTurn`, pass to `claudeService.streamResponse()`
4. **Debug logging** — Add `📷` prefixed logs at each step for traceability

## Files Involved
| File | Role |
|------|------|
| `client/src/components/avatar-chat.tsx` | Image UI, processing, form submission |
| `client/src/hooks/useConversationWs.ts` | WebSocket `sendText` method |
| `client/src/hooks/useAvatarSession.ts` | Message routing (WS vs REST) |
| `server/conversationWsService.ts` | WS handler, `runTurn`, Claude call |
| `server/claudeService.ts` | Claude API integration (already supports images) |

## Flow Diagram
```
User attaches image → processImageFile() → base64 + preview stored in state
User clicks Send → handleSubmitMessage(message, imageData)
  → WS mode active? YES (always now)
    → conversationWs.sendText(message) ← IMAGE DROPPED HERE
    → return early
  → WS mode inactive? (fallback, rarely used)
    → POST /api/audio with imageBase64 + imageMimeType ← WORKS
```

## Status
- **Identified**: 2026-03-11
- **Fixed**: Pending
