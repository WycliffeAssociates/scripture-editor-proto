import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { IssuePanel } from "@/app/routes/-metadata/IssuePanel.tsx";
import { ResourceContainerEditor } from "@/app/routes/-metadata/ResourceContainerEditor.tsx";
import { ScriptureBurritoEditor } from "@/app/routes/-metadata/ScriptureBurritoEditor.tsx";
import { Alert } from "@/app/ui/components/primitives/Alert/Alert.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/MetadataPage.css.ts";
import type { MetadataEditorDocument } from "@/core/domain/project/metadataEditor.ts";

const route = getRouteApi("/$project/metadata");

export function MetadataRoute() {
  const { document } = route.useLoaderData();
  const { project } = route.useParams();
  const search = route.useSearch();
  const navigate = useNavigate();
  const { projectsService } = route.useRouteContext();
  const [editorDocument, setEditorDocument] =
    useState<MetadataEditorDocument | null>(document);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!editorDocument) {
    return (
      <div className={styles.metadataCard}>Project metadata not found.</div>
    );
  }

  const showIssues =
    search.issues === "open" || editorDocument.issues.length > 0;

  async function saveDraft() {
    if (!editorDocument) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await projectsService.saveMetadataEditor(
        project,
        editorDocument.draft,
      );
      setEditorDocument(saved);
      if (search.issues === "open" && saved && saved.issues.length === 0) {
        await navigate({
          to: "/$project",
          params: { project },
        });
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save metadata.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.metadataPage}>
      <div className={styles.metadataHeader}>
        <div className={styles.metadataHeaderLeft}>
          <div className={styles.metadataTitleRow}>
            <h2 className={styles.metadataSectionTitle}>Metadata</h2>
            <span className={styles.badge}>{editorDocument.draft.kind}</span>
          </div>
          <span className={styles.metadataSubtitle}>
            Edit the supported metadata subset for this project.
          </span>
        </div>
        <div className={styles.metadataHeaderRight}>
          <Button
            variant="secondary"
            onClick={() =>
              navigate({
                to: "/$project",
                params: { project },
              })
            }
          >
            Back to Project
          </Button>
          <Button onClick={saveDraft} disabled={isSaving}>
            Save Metadata
          </Button>
        </div>
      </div>

      {showIssues ? <IssuePanel issues={editorDocument.issues} /> : null}
      {saveError ? (
        <Alert color="red" icon={<AlertCircle size={16} />}>
          {saveError}
        </Alert>
      ) : null}

      <div className={styles.metadataCard}>
        {editorDocument.draft.kind === "resource-container" ? (
          <ResourceContainerEditor
            draft={editorDocument.draft}
            onChange={(draft) =>
              setEditorDocument((current) =>
                current
                  ? {
                      ...current,
                      draft,
                    }
                  : current,
              )
            }
          />
        ) : (
          <ScriptureBurritoEditor
            draft={editorDocument.draft}
            onChange={(draft) =>
              setEditorDocument((current) =>
                current
                  ? {
                      ...current,
                      draft,
                    }
                  : current,
              )
            }
          />
        )}
      </div>
    </div>
  );
}
