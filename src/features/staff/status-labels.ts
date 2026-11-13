import type { BadgeTone } from "@/components/ui";
import type { EmployeeStatus } from "./service";

/** Plain labels for employee status; pure, safe to import from client components. */
export const STATUS_LABELS: Record<EmployeeStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  invited: { label: "Invited", tone: "neutral" },
  suspended: { label: "Suspended", tone: "warning" },
  left: { label: "Left", tone: "neutral" },
};
