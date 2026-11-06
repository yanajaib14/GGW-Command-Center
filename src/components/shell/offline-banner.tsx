"use client";

import { useSyncExternalStore } from "react";
import { Banner } from "@/components/ui";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getSnapshot = () => navigator.onLine;
// Assume online during server render so the banner never flashes on hydrate.
const getServerSnapshot = () => true;

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) return null;
  return (
    <div className="px-4 pt-3">
      <Banner tone="warning">You&apos;re offline</Banner>
    </div>
  );
}
