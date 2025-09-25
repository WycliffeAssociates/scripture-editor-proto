import {join} from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {useId, useState} from "react";
import {toast} from "sonner";
import {Input} from "@/components/primitives/input";
import {Label} from "@/components/primitives/label";
import {GitService} from "../git/GitService";

interface FileUploaderProps {
  onProjectCreated: (projectPath: string) => void;
}

export function FileUploader({onProjectCreated}: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const id = useId();

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      // Create a unique directory for this upload
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const projectDir = `project-${timestamp}`;
      // Create projects directory if it doesn't exist
      const projectsBasePath = "projects";
      if (!(await exists(projectsBasePath, {baseDir: BaseDirectory.AppData}))) {
        await mkdir(projectsBasePath, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      }

      // Create project directory
      const projectPath = await join(projectsBasePath, projectDir);
      await mkdir(projectPath, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });

      const filePaths: string[] = [];
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = await join(projectPath, file.name);
        filePaths.push(filePath);
        // Read file as text (assuming USFM files are text)
        const content = await file.text();

        // Write file to the filesystem
        await writeTextFile(filePath, content, {
          baseDir: BaseDirectory.AppData,
        });
      }

      try {
        // Initialize git repository
        const gitService = await GitService.getInstance();
        await gitService.initRepo(projectPath);
        // Stage all files in the project directory
        await gitService.add({
          dir: projectPath,
          filepath: filePaths,
        });
        await gitService.commit({
          dir: projectPath,
          message: "Initial commit: Added project files",
          author: {
            name: "USFM Editor User",
            email: "user@usfmeditor.com",
          },
        });

        setProjectPath(projectPath);
        onProjectCreated(projectPath);
      } catch (error) {
        console.error("Git initialization failed:", error);
        // Continue even if Git fails, as the files are already saved
        const fallbackPath = projectPath;
        setProjectPath(fallbackPath);
        onProjectCreated(fallbackPath);
        toast.success("Files uploaded successfully!");
        return;
      }
      toast.success("Files uploaded and version controlled successfully!");
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error(
        `Failed to upload files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor={id}>Upload USFM Files</Label>
        <Input
          id={id}
          type="file"
          multiple
          accept=".usfm,.sfm"
          onChange={handleFileUpload}
          disabled={isUploading}
          className="cursor-pointer"
        />
        <p className="text-sm text-muted-foreground">
          {isUploading
            ? "Uploading..."
            : "Select one or more USFM files to upload"}
        </p>
      </div>

      {projectPath && (
        <div className="p-4 bg-muted rounded-md">
          <p className="text-sm">
            Project saved to:{" "}
            <code className="bg-background px-2 py-1 rounded">
              {projectPath}
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
