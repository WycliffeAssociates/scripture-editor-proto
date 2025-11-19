import type React from "react";
import { useRef, useState } from "react";
import * as styles from "@/app/ui/styles/modules/projectCreate.css.ts";

type DirImporterProps = {
  /**
   * Handler invoked when a directory is selected.
   * Receives the ChangeEvent<HTMLInputElement> from the hidden file input.
   */
  onOpenDirectory: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Optional className to append to the root action row.
   */
  className?: string;
  /**
   * Optional label displayed above the control.
   */
  label?: string;
};

export function DirImporter({
  onOpenDirectory,
  className = "",
  label = "Upload a folder",
}: DirImporterProps) {
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  function triggerDirPicker() {
    dirInputRef.current?.click();
  }

  return (
    <div className={`${styles.controlGroup} ${className}`}>
      <label className={styles.label}>{label}</label>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.fileButton}
          onClick={triggerDirPicker}
          aria-label="Select folder to upload"
        >
          Select Folder
        </button>

        <span className={styles.actionDescription}>
          Upload a project folder (select directory)
        </span>
      </div>

      {/**
       * biome-ignore lint/correctness/useUniqueElementIds: This input is intentionally not given a
       * unique id because these primitives are expected to be used in multiple places and the
       * picker is invoked via the button above.
       */}
      <input
        ref={dirInputRef}
        type="file"
        // Allow directory selection in browsers that support this attribute
        // The project's ambient types include webkitdirectory on InputHTMLAttributes.
        // @ts-expect-error - the attribute is intentionally present for browsers that support it
        webkitdirectory="true"
        multiple
        className={styles.hiddenInput}
        onChange={onOpenDirectory}
      />
    </div>
  );
}

type FileImporterProps = {
  /**
   * Handler invoked when a file (typically a ZIP) is selected.
   */
  onOpenFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Optional accepted file types string (e.g. ".zip").
   */
  accept?: string;
  className?: string;
  label?: string;
};

export function FileImporter({
  onOpenFile,
  accept = ".zip",
  className = "",
  label = "Select a ZIP file",
}: FileImporterProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  return (
    <div className={`${styles.controlGroup} ${className}`}>
      <label className={styles.label}>{label}</label>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.fileButton}
          onClick={triggerFilePicker}
          aria-label="Select file to upload"
        >
          Choose File
        </button>

        <span className={styles.actionDescription}>
          Compressed project archive ({accept})
        </span>
      </div>

      {/** biome-ignore lint/correctness/useUniqueElementIds: hidden input triggered above */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={onOpenFile}
        className={styles.hiddenInput}
      />
    </div>
  );
}

type WacsImporterProps = {
  /**
   * Called with the URL or identifier to download/import from remote.
   */
  onDownload: (url: string) => void;
  /**
   * Optional default value for the input.
   */
  initialValue?: string;
  className?: string;
  label?: string;
  /**
   * Optional placeholder for the input.
   */
  placeholder?: string;
};

/**
 * Lightweight primitive that provides an input + action to trigger a remote
 * repository import. This mirrors the "search / download" piece but is intentionally
 * small so it can be composed into larger blocks (or replaced by the richer `RepoDownload`).
 */
export function WacsImporter({
  onDownload,
  initialValue = "",
  className = "",
  label = "Repository URL or identifier",
  placeholder = "https://example.com/repo or org/name",
}: WacsImporterProps) {
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDownloadClick() {
    if (!value.trim()) return;
    try {
      setIsSubmitting(true);
      // Caller is responsible for performing the actual download/import.
      onDownload(value.trim());
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`${styles.controlGroup} ${className}`}>
      <label className={styles.label}>{label}</label>

      <div className={styles.actionRow}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`${styles.repoInput} ${styles.repoContainer}`}
          aria-label="Repository to download"
        />
        <button
          type="button"
          className={styles.downloadButton}
          onClick={handleDownloadClick}
          disabled={isSubmitting || value.trim() === ""}
          aria-label="Download repository"
        >
          {isSubmitting ? "Downloading…" : "Download"}
        </button>
      </div>

      <div className={styles.repoHelper}>
        Enter a repository URL or identifier and click Download to import a
        remote scripture repository into the editor.
      </div>
    </div>
  );
}

export default {
  DirImporter,
  FileImporter,
  WacsImporter,
};
