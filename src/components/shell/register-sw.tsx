"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only. */
export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is an enhancement; failing to register is not fatal.
    });
  }, []);
  return null;
}
