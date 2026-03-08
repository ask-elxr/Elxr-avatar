# ELXR AI Mentor Iframe Embed Snippets

Copy and paste these iframe snippets into your website to embed the AI mentors.

**Replace `YOUR-DOMAIN` with your actual Railway domain (e.g., `your-app.up.railway.app`).**

**Important:** You must pass the Memberstack `member_id` as a query parameter for chat to work. See [Authentication](#authentication) below.

---

## Authentication

Chat endpoints require a valid `member_id` to authenticate. There are two ways to pass it:

### Option A: URL Query Parameter (Recommended)

Dynamically set the iframe `src` with the logged-in user's Memberstack ID:

```html
<iframe
  id="elxrai-iframe"
  frameborder="0"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  style="width: 100%; height: 600px; border: none;"
  title="Chat with Mentor">
</iframe>

<script>
  const memberstack = window.$memberstackDom;
  memberstack.getCurrentMember().then(({ data: member }) => {
    const iframe = document.getElementById('elxrai-iframe');
    const memberId = member ? member.id : '';
    iframe.src = `https://YOUR-DOMAIN/embed/chat/dexter?member_id=${memberId}`;
  });
</script>
```

### Option B: postMessage (after iframe loads)

Send the member ID to an already-loaded iframe via postMessage:

```html
<iframe
  id="elxrai-iframe"
  src="https://YOUR-DOMAIN/embed/chat/dexter"
  frameborder="0"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  style="width: 100%; height: 600px; border: none;"
  title="Chat with Mentor">
</iframe>

<script>
  const iframe = document.getElementById('elxrai-iframe');
  const memberstack = window.$memberstackDom;
  iframe.addEventListener('load', () => {
    memberstack.getCurrentMember().then(({ data: member }) => {
      if (member) {
        iframe.contentWindow.postMessage(
          { type: 'memberstack-auth', member_id: member.id },
          'https://YOUR-DOMAIN'
        );
      }
    });
  });
</script>
```

---

## Mentor Embed Snippets

### 1. Mark Kohl
**Expertise:** Psychedelics, Spirituality, Fungi, Kundalini

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/mark-kohl?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with Mark Kohl">
</iframe>
```

### 2. Willie Gault
**Expertise:** Work, Career, Performance, Athletic Excellence

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/willie-gault?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with Willie Gault">
</iframe>
```

### 3. June
**Expertise:** Mental Health, Mindfulness, Emotional Wellbeing

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/june?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with June">
</iframe>
```

### 4. Ann
**Expertise:** Body Wellness, Physical Health, Movement, Nutrition

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/ann?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with Ann">
</iframe>
```

### 5. Shawn
**Expertise:** Conscious Leadership, Performance Integration, Personal Development

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/shawn?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with Shawn">
</iframe>
```

### 6. Thad
**Expertise:** Financial Resilience, Purposeful Wealth, Money Mindset

```html
<iframe
  src="https://YOUR-DOMAIN/embed/chat/thad?member_id=MEMBER_ID"
  style="width: 100%; height: 600px; border: none;"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  title="Chat with Thad">
</iframe>
```

---

## Usage Notes

### Required Permissions
All iframes include the `allow` attribute with these permissions:
- `camera` - For video features (optional)
- `microphone` - For voice input (optional)
- `autoplay` - For avatar video playback
- `encrypted-media` - For secure media streaming
- `fullscreen` - To enable fullscreen mode

### Responsive Container
For better responsive behavior, wrap the iframe in a container:
```html
<div style="position: relative; width: 100%; padding-bottom: 75%;">
  <iframe
    src="https://YOUR-DOMAIN/embed/chat/mark-kohl?member_id=MEMBER_ID"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
    allow="camera; microphone; autoplay; encrypted-media; fullscreen"
    allowfullscreen
    title="Chat with Mark Kohl">
  </iframe>
</div>
```

### Getting Your Domain
1. Deploy your app on Railway
2. Find your public domain in Railway dashboard (Settings > Networking)
3. Replace `YOUR-DOMAIN` in all snippets with your actual domain

### Testing
Before deploying to production:
1. Test each iframe in a local HTML file
2. Verify all mentor IDs work correctly
3. Ensure `member_id` is being passed (check DevTools Network tab for `X-Member-Id` header)
4. Check responsive behavior on mobile devices
5. Confirm audio/video permissions are requested properly

---

## Support
If you encounter issues with the embeds, verify:
- Domain is correct and app is deployed
- `member_id` is passed via URL param or postMessage
- CORS is enabled on the server (already configured)
- Mentor ID matches exactly (case-sensitive)
- All required `allow` permissions are included
