import { inject } from "@vercel/analytics";

// Bundled only into the hosted/standalone build. Native-module source previews
// stay dependency-free, and local files/LAN testing/QA never send page views.
if (typeof window !== "undefined") {
  const { hostname, protocol, search } = window.location;
  const local =
    !hostname.includes(".") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      hostname,
    );
  if (protocol === "https:" && !local && !new URLSearchParams(search).has("qa"))
    inject({ mode: "production", debug: false });
}
