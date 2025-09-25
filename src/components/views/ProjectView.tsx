import {Suspense} from "react";
import {ReferenceEditor} from "@/components/ui/ReferenceEditor";
import {useProjectContext} from "@/contexts/ProjectContext";
import {Editor} from "@/features/editor/Editor";

export function ProjectView() {
  const {
    allFiles,
    pickedFile,
    pickedChapter,
    currentFile,
    currentChapter,
    setCurrentFile,
    setCurrentChapter,
    switchChapter,
    switchFile,
  } = useProjectContext();

  return (
    <div>
      <h1>Project View</h1>

      <div className="flex gap-8">
        {/* File list */}
        <div>
          <h2>Files</h2>
          <ul>
            {allFiles?.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  className={`hover:bg-gray-100 p-2 ${
                    currentFile === file.path ? "font-bold" : ""
                  }`}
                  onClick={() => switchFile(file.path)}
                >
                  {file.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Chapter list */}
        <div>
          <h2>Chapters</h2>
          <ul>
            {pickedFile &&
              Object.keys(pickedFile.chapters)
                .sort((a, b) => Number(a) - Number(b))
                .map((chap) => (
                  <li key={chap}>
                    <button
                      type="button"
                      className={`hover:bg-gray-100 p-2 ${
                        Number(chap) === currentChapter ? "font-bold" : ""
                      }`}
                      onClick={() => switchChapter(Number(chap))}
                    >
                      Chapter {chap}
                    </button>
                  </li>
                ))}
          </ul>
        </div>

        {/* Editor */}
        <div className="flex">
          <Editor />
          {/* <ReferenceEditor /> */}
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        {pickedFile && pickedChapter ? (
          <div className="mt-4">
            <strong>Current Chapter Tokens:</strong>
            <pre>{JSON.stringify(pickedChapter.tokens.length, null, 2)}</pre>
          </div>
        ) : (
          <div>Select a file and chapter to view</div>
        )}
      </Suspense>
    </div>
  );
}
