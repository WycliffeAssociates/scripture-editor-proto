import { AlertCircle } from "lucide-react";

import { Alert } from "@/app/ui/components/primitives/Alert/Alert.tsx";
import type { MetadataIssue } from "@/core/domain/project/metadataEditor.ts";

export function IssuePanel({ issues }: { issues: MetadataIssue[] }) {
  if (issues.length === 0) {
    return (
      <Alert color="green" icon={<AlertCircle size={16} />}>
        No metadata issues were detected for the current supported rules.
      </Alert>
    );
  }

  return (
    <Alert color="red" icon={<AlertCircle size={16} />}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 600 }}>Metadata issues</span>
        {issues.map((issue) => (
          <div key={`${issue.fieldPath}-${issue.message}`}>
            <span style={{ fontSize: "0.875rem" }}>{issue.message}</span>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--color-onSurfaceTertiary)",
              }}
            >
              {issue.fieldPath}
              {issue.suggestedValue
                ? ` -> Suggested: ${issue.suggestedValue}`
                : ""}
            </span>
          </div>
        ))}
      </div>
    </Alert>
  );
}
