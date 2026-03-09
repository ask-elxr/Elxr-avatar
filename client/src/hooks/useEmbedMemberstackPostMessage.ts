import { useEffect } from "react";

const EMBED_MESSAGE_TYPE = "ELXR_MEMBERSTACK_ID";

/**
 * Listens for postMessage from the parent (e.g. Webflow) with the Memberstack member ID.
 * Allows avatars to be used without logging into the Railway app; the parent passes
 * the logged-in Memberstack member so memories and subscription are tracked.
 *
 * Parent should send: { type: 'ELXR_MEMBERSTACK_ID', memberId: 'mem_xxx' }
 * Send as soon as Memberstack resolves (e.g. MemberStack.onReady) so the avatar
 * connection uses it.
 */
export function useEmbedMemberstackPostMessage(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: MessageEvent) => {
      try {
        const data = event.data;
        if (!data || data?.type !== EMBED_MESSAGE_TYPE) return;
        const memberId = typeof data.memberId === "string" ? data.memberId.trim() : "";
        if (!memberId) return;
        localStorage.setItem("memberstack_id", memberId);
        console.log("[ELXR] Memberstack ID received from parent for memory/subscription");
      } catch {
        // ignore invalid messages
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
}
