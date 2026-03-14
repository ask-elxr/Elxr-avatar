import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp";
import "./index.css";

// Patch fetch to prefix relative API URLs with the API base URL.
// This allows all admin components to use relative URLs (e.g., "/api/admin/...")
// while the admin app is hosted on a different domain (e.g., Firebase Hosting).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
if (API_BASE) {
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === 'string' && input.startsWith('/')) {
      input = `${API_BASE}${input}`;
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById("root")!).render(<AdminApp />);
