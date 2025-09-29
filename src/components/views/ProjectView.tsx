import { Suspense, useState } from "react";
import { Input } from "@/components/primitives/input";
import { ReferenceEditor } from "@/components/ui/ReferenceEditor";
import { Toolbar } from "@/components/ui/Toolbar";
import { useProjectContext } from "@/contexts/ProjectContext";
import { ParsedFile } from "@/customTypes/types";
import { Editor } from "@/features/editor/Editor";
import { parseReference } from "@/utils/bible";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "../primitives/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";

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
            <Toolbar />

            <div className="flex gap-8">
                {/* File list */}
                {/* <div>
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
        </div> */}

                {/* Chapter list */}
                {/* <div>
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
        </div> */}

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
                        <pre>
                            {JSON.stringify(
                                pickedChapter.tokens.length,
                                null,
                                2,
                            )}
                        </pre>
                    </div>
                ) : (
                    <div>Select a file and chapter to view</div>
                )}
            </Suspense>
        </div>
    );
}

type Props = {
    allFiles: ParsedFile[] | undefined;
    currentFile: string | undefined;
    currentChapter: number | undefined;
    switchTo: (file: string, chapter: number) => void;
};

export function ReferencePicker({
    allFiles,
    currentFile,
    currentChapter,
    switchTo,
}: Props) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const ref = parseReference(search);
        console.log(ref);
        if (ref) {
            const file = allFiles?.find(
                (f) =>
                    f.identifier?.toLowerCase() ===
                    ref.identifier?.toLowerCase(),
            );
            if (file) {
                switchTo(file.path, ref.chapter ?? currentChapter ?? 0);
            }
            setSearch("");
            setOpen(false);
        }
    }

    const currentBook =
        allFiles?.find((f) => f.path === currentFile)?.title ?? "Select";
    const currentDisplay = currentChapter
        ? `${currentBook} ${currentChapter}`
        : currentBook;

    if (!allFiles) return null;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex items-center justify-between w-48 px-3 py-2 border rounded-md shadow-sm text-sm"
                >
                    <span>📖 {currentDisplay}</span>
                    <span className="ml-2">▾</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0">
                {/* Search Bar */}
                <form onSubmit={handleSubmit}>
                    <Input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search (e.g. Mat9, 1Co1)"
                        className="rounded-none border-0 border-b"
                    />
                </form>

                {/* Accordion Dropdown */}
                <Accordion type="single" collapsible className="w-full">
                    {allFiles.map((file) => (
                        <AccordionItem key={file.path} value={file.title}>
                            <AccordionTrigger
                                // onClick={() => switchFile(file.path)}
                                className={`px-3 py-2 text-sm ${
                                    currentFile === file.path ? "font-bold" : ""
                                }`}
                            >
                                {file.title}
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="grid grid-cols-7 gap-1 p-2">
                                    {Object.keys(file.chapters)
                                        .sort((a, b) => Number(a) - Number(b))
                                        .map((chap) => (
                                            <button
                                                key={chap}
                                                type="button"
                                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 ${
                                                    Number(chap) ===
                                                    currentChapter
                                                        ? "bg-gray-200 font-bold"
                                                        : ""
                                                }`}
                                                onClick={() => {
                                                    switchTo(
                                                        file.path,
                                                        Number(chap),
                                                    );
                                                    setOpen(false);
                                                }}
                                            >
                                                {chap}
                                            </button>
                                        ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </PopoverContent>
        </Popover>
    );
}
