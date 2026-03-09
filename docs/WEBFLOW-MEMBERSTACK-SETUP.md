# How to Implement Avatar Embed in Webflow with Memberstack

Step-by-step guide so users **log in only on Webflow (Memberstack)** and the avatar tracks **memories and subscription** without any Railway login.

---

## What you need

- Your **Railway (or Replit) app URL** where the avatar is hosted, e.g. `https://your-app.railway.app`
- A **Webflow page** with Memberstack already set up (members can log in)
- The **mentor/avatar slug** you want to embed, e.g. `mark-kohl`, `june`, `willie-gault`

---

## Option A: Dynamic iframe URL (recommended)

The iframe gets its `src` only after Memberstack tells us who’s logged in. Member ID is in the URL, so the avatar app gets it as soon as it loads.

### 1. Add the iframe element in Webflow

1. Open your Webflow page in the **Designer**.
2. Add an **Embed** element (or a **Div** you’ll put the iframe in).
3. **Don’t** set the iframe URL in the designer — we’ll set it with code. So either:
   - Use a **Custom Code** embed and paste the full snippet below, or
   - Add a **Div**, give it an ID (e.g. `elxr-avatar-container`), then in **Page Settings → Custom Code** add the script that creates the iframe and sets `src` (see step 2).

### 2. Add the script that sets the iframe URL

In **Webflow**:  
**Page Settings** (gear icon) → **Custom Code** → **Footer Code** (or **Head Code** if you prefer), paste:

```html
<script>
(function() {
  var RAILWAY_URL = 'https://YOUR-RAILWAY-DOMAIN';   // e.g. https://your-app.railway.app
  var MENTOR = 'mark-kohl';   // mentor slug: mark-kohl, june, willie-gault, ann, shawn, thad
  var CONTAINER_ID = 'elxr-avatar-container';       // ID of the div that will hold the iframe

  function initAvatar() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    var base = RAILWAY_URL + '/avatar?mentor=' + MENTOR;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'camera; microphone; autoplay; encrypted-media; fullscreen');
    iframe.allowFullscreen = true;
    iframe.title = 'Chat with mentor';
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = 'none';

    if (typeof MemberStack !== 'undefined' && MemberStack.onReady) {
      MemberStack.onReady.then(function(member) {
        iframe.src = (member && member.id) ? base + '&member_id=' + encodeURIComponent(member.id) : base;
      });
    } else {
      iframe.src = base;
    }
    container.appendChild(iframe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAvatar);
  } else {
    initAvatar();
  }
})();
</script>
```

Replace:

- `YOUR-RAILWAY-DOMAIN` → your actual app host (e.g. `your-app.railway.app`, no `https://` in that variable if you already have it in `RAILWAY_URL` — the snippet uses `RAILWAY_URL` as full base).
- `mark-kohl` → your mentor slug if different.
- `elxr-avatar-container` → the ID of the **Div** you added to hold the iframe (create a Div block, set its ID in the element settings).

**If you prefer a single Custom Code embed** (no separate Div), use this in an **Embed** element instead:

```html
<div id="elxr-avatar-container" style="width:100%; min-height:600px;"></div>
<script>
(function() {
  var RAILWAY_URL = 'https://YOUR-RAILWAY-DOMAIN';
  var MENTOR = 'mark-kohl';
  var CONTAINER_ID = 'elxr-avatar-container';

  function initAvatar() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    var base = RAILWAY_URL + '/avatar?mentor=' + MENTOR;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'camera; microphone; autoplay; encrypted-media; fullscreen');
    iframe.allowFullscreen = true;
    iframe.title = 'Chat with mentor';
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = 'none';

    if (typeof MemberStack !== 'undefined' && MemberStack.onReady) {
      MemberStack.onReady.then(function(member) {
        iframe.src = (member && member.id) ? base + '&member_id=' + encodeURIComponent(member.id) : base;
      });
    } else {
      iframe.src = base;
    }
    container.appendChild(iframe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAvatar);
  } else {
    initAvatar();
  }
})();
</script>
```

Again, replace `YOUR-RAILWAY-DOMAIN` and `MENTOR` with your values.

### 3. Publish and test

- Publish the page.
- Open it as a **logged-in Memberstack member** → avatar should load with `member_id` in the URL and memories/subscription tied to that member.
- Open it in an **incognito window (not logged in)** → avatar should still load, but without a member ID (anonymous).

---

## Option B: Static iframe URL + postMessage

You set the iframe in the Webflow designer with a **fixed** URL. The page then sends the Memberstack member ID into the iframe via **postMessage**. The avatar app (already implemented) listens and uses it for memory/subscription.

### 1. Add the iframe in Webflow

1. In the Designer, add an **Embed** element.
2. Paste this, with your real URL and mentor:

```html
<iframe 
  src="https://YOUR-RAILWAY-DOMAIN/avatar?mentor=mark-kohl" 
  style="width:100%; height:600px; border:none;" 
  allow="camera; microphone; autoplay; encrypted-media; fullscreen" 
  allowfullscreen
  title="Chat with mentor">
</iframe>
```

Replace `YOUR-RAILWAY-DOMAIN` and `mark-kohl` with your values.

### 2. Send Memberstack member ID via postMessage

In **Page Settings** → **Custom Code** → **Footer Code**, add:

```html
<script>
  if (typeof MemberStack !== 'undefined' && MemberStack.onReady) {
    MemberStack.onReady.then(function(member) {
      if (!member || !member.id) return;
      var iframe = document.querySelector('iframe[src*="/avatar"]') || document.querySelector('iframe[src*="/embed/chat"]');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'ELXR_MEMBERSTACK_ID', memberId: member.id }, '*');
      }
    });
  }
</script>
```

Important: this must run **as soon as possible** after the iframe is on the page (e.g. footer code is fine). The avatar app listens for `ELXR_MEMBERSTACK_ID` and stores the member ID so the WebSocket and APIs use it for memories and subscription.

### 3. Publish and test

- Publish, then open the page **logged in** as a Memberstack member. Memories and subscription should be tied to that member.
- If the avatar sometimes connects before the postMessage arrives, Option A (dynamic URL) is more reliable.

---

## Checklist

| Step | Option A | Option B |
|------|----------|----------|
| Add iframe or container | Div with ID or Embed with div + script | Embed with static `src` |
| Set Railway URL + mentor | In script: `RAILWAY_URL`, `MENTOR` | In iframe `src` |
| Add Memberstack script | In same script (MemberStack.onReady → set iframe.src with member_id) | Footer: MemberStack.onReady → postMessage |
| Publish | Yes | Yes |

---

## Troubleshooting

- **Avatar loads but no memories**  
  Member ID isn’t reaching the app. Option A: check that `member_id` appears in the iframe URL when logged in. Option B: ensure the postMessage script runs (Memberstack loaded, iframe already in the DOM).
- **"Authentication required" or connection fails**  
  Use the `/avatar?mentor=...` URL (not an old path). If you use Option B, send the postMessage as early as possible (footer code right after body is fine).
- **Memberstack not defined**  
  Ensure Memberstack is installed and loads before your script (e.g. use Footer Code so it runs after the page and Memberstack).

Once this is in place, users only log in on Webflow with Memberstack; the avatar embed works without any Railway login and still gets the correct member for memories and subscription.
