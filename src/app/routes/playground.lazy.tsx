import {
    Button,
    Card,
    Container,
    Group,
    Stack,
    Table,
    Text,
    Title,
} from "@mantine/core";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";
/**
 * Internal profiling/maintenance route.
 *
 * This route exists for local experiments around OPFS import costs and simple
 * on-disk cleanup tasks. It is intentionally outside the product UX contract.
 */
export const Route = createLazyFileRoute("/playground")({
    component: PlaygroundRoute,
});

type MeasurementResult = {
    fileCount: number;
    totalBytes: number;
    elapsedMs: number;
    destinationPath: string;
};

type OpfsProjectFolder = {
    name: string;
    path: string;
};

type MeasurementMode = "raw-opfs" | "book-json" | "single-json";

type LogFn = (message: string) => void;

/**
 * Default to half the reported hardware concurrency so web import experiments can
 * approximate the bounded-concurrency strategy used by the real web import path.
 */
function getDefaultConcurrency(): number {
    const cores =
        typeof navigator !== "undefined" &&
        typeof navigator.hardwareConcurrency === "number" &&
        Number.isFinite(navigator.hardwareConcurrency)
            ? navigator.hardwareConcurrency
            : 4;
    return Math.max(1, Math.floor(cores / 2));
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

async function ensureDirectory(
    root: FileSystemDirectoryHandle,
    segments: string[],
): Promise<FileSystemDirectoryHandle> {
    let current = root;
    for (const segment of segments) {
        current = await current.getDirectoryHandle(segment, { create: true });
    }
    return current;
}

function getPathSegments(path: string): string[] {
    return path.split("/").filter(Boolean);
}

async function getDirectoryHandleByPath(
    root: FileSystemDirectoryHandle,
    path: string,
): Promise<FileSystemDirectoryHandle> {
    let current = root;
    for (const segment of getPathSegments(path)) {
        current = await current.getDirectoryHandle(segment, { create: true });
    }
    return current;
}

async function listTopLevelProjectFolders(): Promise<OpfsProjectFolder[]> {
    const storageRoots = new OpfsStorageRoots();
    const opfsRoot = await navigator.storage.getDirectory();
    const projectsRoot = await getDirectoryHandleByPath(
        opfsRoot,
        storageRoots.projectsRoot,
    );
    const folders: OpfsProjectFolder[] = [];

    for await (const [name, handle] of projectsRoot.entries()) {
        if (handle.kind !== "directory") {
            continue;
        }

        folders.push({
            name,
            path: `${storageRoots.projectsRoot}/${name}`,
        });
    }

    folders.sort((left, right) => left.name.localeCompare(right.name));
    return folders;
}

async function deleteTopLevelProjectFolder(path: string): Promise<void> {
    const storageRoots = new OpfsStorageRoots();
    const opfsRoot = await navigator.storage.getDirectory();
    const segments = getPathSegments(path);
    const rootSegments = getPathSegments(storageRoots.projectsRoot);
    const folderName = segments.at(-1);
    if (!folderName || segments.length !== rootSegments.length + 1) {
        throw new Error(
            `Expected a top-level project folder path, received ${path}`,
        );
    }

    const projectsRoot = await getDirectoryHandleByPath(
        opfsRoot,
        storageRoots.projectsRoot,
    );
    await projectsRoot.removeEntry(folderName, { recursive: true });
}

async function writeDirectoryToOpfs(args: {
    files: FileList;
    concurrency: number;
    log: LogFn;
}): Promise<MeasurementResult> {
    const { files, concurrency, log } = args;
    const entries = Array.from(files)
        .map((file) => ({
            file,
            relativePath: file.webkitRelativePath.split("/").slice(1).join("/"),
        }))
        .filter((entry) => entry.relativePath.length > 0);

    const opfsRoot = await navigator.storage.getDirectory();
    const tmpRoot = await opfsRoot.getDirectoryHandle("tmp", { create: true });
    const destinationName = `playground-opfs-${Date.now()}`;
    const destinationRoot = await tmpRoot.getDirectoryHandle(destinationName, {
        create: true,
    });

    let totalBytes = 0;
    let completedFiles = 0;
    let nextIndex = 0;
    const startedAt = performance.now();

    log(
        `Starting raw OPFS write with concurrency ${concurrency} for ${entries.length.toLocaleString()} files...`,
    );

    const worker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= entries.length) {
                return;
            }

            const entry = entries[index];
            const pathSegments = entry.relativePath.split("/").filter(Boolean);
            const fileName = pathSegments.pop();
            if (!fileName) {
                continue;
            }

            const parentDir = await ensureDirectory(
                destinationRoot,
                pathSegments,
            );
            const fileHandle = await parentDir.getFileHandle(fileName, {
                create: true,
            });
            const writable = await fileHandle.createWritable();
            await writable.write(await entry.file.arrayBuffer());
            await writable.close();

            totalBytes += entry.file.size;
            completedFiles += 1;
            if (completedFiles === 1 || completedFiles % 250 === 0) {
                log(
                    `Wrote ${completedFiles.toLocaleString()}/${entries.length.toLocaleString()} raw files...`,
                );
            }
        }
    };

    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    Math.max(1, concurrency),
                    Math.max(1, entries.length),
                ),
            },
            () => worker(),
        ),
    );

    const elapsedMs = performance.now() - startedAt;
    return {
        fileCount: entries.length,
        totalBytes,
        elapsedMs,
        destinationPath: `/tmp/${destinationName}`,
    };
}

function normalizeBookCode(segment: string): string {
    return segment.trim().toUpperCase();
}

async function writePackedBooksSerially(
    files: FileList,
    concurrency: number,
    log: LogFn,
): Promise<MeasurementResult> {
    const entries = Array.from(files)
        .map((file) => ({
            file,
            relativePath: file.webkitRelativePath.split("/").slice(1).join("/"),
        }))
        .filter((entry) => entry.relativePath.length > 0);

    const opfsRoot = await navigator.storage.getDirectory();
    const tmpRoot = await opfsRoot.getDirectoryHandle("tmp", { create: true });
    const destinationName = `playground-book-json-${Date.now()}`;
    const destinationRoot = await tmpRoot.getDirectoryHandle(destinationName, {
        create: true,
    });

    const books = new Map<string, Record<string, Record<string, string>>>();
    let scannedFiles = 0;
    let sourceBytes = 0;
    let nextIndex = 0;
    const startedAt = performance.now();

    log(
        `Scanning ${entries.length.toLocaleString()} uploaded files with concurrency ${concurrency}...`,
    );

    const worker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= entries.length) {
                return;
            }

            const entry = entries[index];
            const pathSegments = entry.relativePath.split("/").filter(Boolean);
            if (pathSegments.length !== 3) {
                continue;
            }

            const [bookSegment, chapterSegment, verseFileName] = pathSegments;
            const verseSegment = verseFileName.replace(/\.[^.]+$/u, "");
            const bookCode = normalizeBookCode(bookSegment);
            if (!canonicalBookMap[bookCode]) {
                continue;
            }

            const chapter = chapterSegment.trim();
            const verse = verseSegment.trim();
            if (!chapter || !verse) {
                continue;
            }

            const contents = await entry.file.text();
            let chapterMap = books.get(bookCode);
            if (!chapterMap) {
                chapterMap = {};
                books.set(bookCode, chapterMap);
            }
            let verseMap = chapterMap[chapter];
            if (!verseMap) {
                verseMap = {};
                chapterMap[chapter] = verseMap;
            }
            verseMap[verse] = contents;

            scannedFiles += 1;
            sourceBytes += entry.file.size;
            if (scannedFiles === 1 || scannedFiles % 250 === 0) {
                log(
                    `Scanned ${scannedFiles.toLocaleString()} note files into ${books.size.toLocaleString()} book buckets...`,
                );
            }
        }
    };

    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    Math.max(1, concurrency),
                    Math.max(1, entries.length),
                ),
            },
            () => worker(),
        ),
    );

    const sortedBookCodes = [...books.keys()].sort((left, right) => {
        const leftOrder = Number.parseInt(
            canonicalBookMap[left]?.num ?? "999",
            10,
        );
        const rightOrder = Number.parseInt(
            canonicalBookMap[right]?.num ?? "999",
            10,
        );
        return leftOrder - rightOrder || left.localeCompare(right);
    });

    log(
        `Writing ${sortedBookCodes.length.toLocaleString()} packed book files...`,
    );

    for (let index = 0; index < sortedBookCodes.length; index += 1) {
        const bookCode = sortedBookCodes[index];
        const payload = JSON.stringify(
            {
                bookCode,
                chapters: books.get(bookCode) ?? {},
            },
            null,
            2,
        );
        const fileHandle = await destinationRoot.getFileHandle(
            `${bookCode.toLowerCase()}.json`,
            {
                create: true,
            },
        );
        const writable = await fileHandle.createWritable();
        await writable.write(payload);
        await writable.close();

        log(
            `Wrote ${index + 1}/${sortedBookCodes.length} packed books (${bookCode}).`,
        );
    }

    const elapsedMs = performance.now() - startedAt;
    return {
        fileCount: sortedBookCodes.length,
        totalBytes: sourceBytes,
        elapsedMs,
        destinationPath: `/tmp/${destinationName}`,
    };
}

async function writeSinglePackedJson(
    files: FileList,
    concurrency: number,
    log: LogFn,
): Promise<MeasurementResult> {
    const entries = Array.from(files)
        .map((file) => ({
            file,
            relativePath: file.webkitRelativePath.split("/").slice(1).join("/"),
        }))
        .filter((entry) => entry.relativePath.length > 0);

    const opfsRoot = await navigator.storage.getDirectory();
    const tmpRoot = await opfsRoot.getDirectoryHandle("tmp", { create: true });
    const destinationName = `playground-single-json-${Date.now()}`;
    const destinationRoot = await tmpRoot.getDirectoryHandle(destinationName, {
        create: true,
    });

    const books = new Map<string, Record<string, Record<string, string>>>();
    let scannedFiles = 0;
    let sourceBytes = 0;
    let nextIndex = 0;
    const startedAt = performance.now();

    log(
        `Scanning ${entries.length.toLocaleString()} uploaded files with concurrency ${concurrency} for one tn.json...`,
    );

    const worker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= entries.length) {
                return;
            }

            const entry = entries[index];
            const pathSegments = entry.relativePath.split("/").filter(Boolean);
            if (pathSegments.length !== 3) {
                continue;
            }

            const [bookSegment, chapterSegment, verseFileName] = pathSegments;
            const verseSegment = verseFileName.replace(/\.[^.]+$/u, "");
            const bookCode = normalizeBookCode(bookSegment);
            if (!canonicalBookMap[bookCode]) {
                continue;
            }

            const chapter = chapterSegment.trim();
            const verse = verseSegment.trim();
            if (!chapter || !verse) {
                continue;
            }

            const contents = await entry.file.text();
            let chapterMap = books.get(bookCode);
            if (!chapterMap) {
                chapterMap = {};
                books.set(bookCode, chapterMap);
            }
            let verseMap = chapterMap[chapter];
            if (!verseMap) {
                verseMap = {};
                chapterMap[chapter] = verseMap;
            }
            verseMap[verse] = contents;

            scannedFiles += 1;
            sourceBytes += entry.file.size;
            if (scannedFiles === 1 || scannedFiles % 250 === 0) {
                log(
                    `Scanned ${scannedFiles.toLocaleString()} note files into ${books.size.toLocaleString()} book buckets...`,
                );
            }
        }
    };

    await Promise.all(
        Array.from(
            {
                length: Math.min(
                    Math.max(1, concurrency),
                    Math.max(1, entries.length),
                ),
            },
            () => worker(),
        ),
    );

    const sortedBookCodes = [...books.keys()].sort((left, right) => {
        const leftOrder = Number.parseInt(
            canonicalBookMap[left]?.num ?? "999",
            10,
        );
        const rightOrder = Number.parseInt(
            canonicalBookMap[right]?.num ?? "999",
            10,
        );
        return leftOrder - rightOrder || left.localeCompare(right);
    });

    const payload = JSON.stringify(
        {
            books: Object.fromEntries(
                sortedBookCodes.map((bookCode) => [
                    bookCode,
                    books.get(bookCode) ?? {},
                ]),
            ),
        },
        null,
        2,
    );

    log(
        `Writing one packed tn.json file for ${sortedBookCodes.length.toLocaleString()} books...`,
    );

    const fileHandle = await destinationRoot.getFileHandle("tn.json", {
        create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    log("Wrote 1/1 packed tn.json file.");

    const elapsedMs = performance.now() - startedAt;
    return {
        fileCount: 1,
        totalBytes: sourceBytes,
        elapsedMs,
        destinationPath: `/tmp/${destinationName}`,
    };
}

function PlaygroundRoute() {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [mode, setMode] = useState<MeasurementMode>("raw-opfs");
    const [concurrency, setConcurrency] = useState<number>(() =>
        getDefaultConcurrency(),
    );
    const [status, setStatus] = useState<string>(
        "Pick a folder to measure serial File -> OPFS writes.",
    );
    const [result, setResult] = useState<MeasurementResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [projectFolders, setProjectFolders] = useState<OpfsProjectFolder[]>(
        [],
    );
    const [isRefreshingFolders, setIsRefreshingFolders] = useState(false);
    const [deletingFolderPath, setDeletingFolderPath] = useState<string | null>(
        null,
    );

    const refreshProjectFolders = useCallback(async () => {
        setIsRefreshingFolders(true);
        try {
            setProjectFolders(await listTopLevelProjectFolders());
        } finally {
            setIsRefreshingFolders(false);
        }
    }, []);

    const appendLog = (message: string) => {
        setLogs((current) => [
            ...current,
            `${new Date().toLocaleTimeString()}: ${message}`,
        ]);
    };

    useEffect(() => {
        void refreshProjectFolders();
    }, [refreshProjectFolders]);

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Stack gap={4}>
                    <Title order={1}>Playground</Title>
                    <Text c="dimmed">
                        Minimal OPFS measurement route. Use raw file writes or
                        TN-style per-book JSON packing with live logging, with
                        no import, indexing, or git code.
                    </Text>
                </Stack>

                <Card withBorder radius="md" padding="lg">
                    <Stack gap="md">
                        <Group>
                            <Button
                                variant={
                                    mode === "raw-opfs" ? "filled" : "light"
                                }
                                onClick={() => {
                                    setMode("raw-opfs");
                                    setStatus(
                                        "Pick a folder to measure serial File -> OPFS writes.",
                                    );
                                }}
                                disabled={isRunning}
                            >
                                Raw OPFS
                            </Button>
                            <Button
                                variant={
                                    mode === "book-json" ? "filled" : "light"
                                }
                                onClick={() => {
                                    setMode("book-json");
                                    setStatus(
                                        "Pick a TN-style folder to measure serial read + per-book JSON writes.",
                                    );
                                }}
                                disabled={isRunning}
                            >
                                Book JSON
                            </Button>
                            <Button
                                variant={
                                    mode === "single-json" ? "filled" : "light"
                                }
                                onClick={() => {
                                    setMode("single-json");
                                    setStatus(
                                        "Pick a TN-style folder to measure serial read + one tn.json write.",
                                    );
                                }}
                                disabled={isRunning}
                            >
                                Single JSON
                            </Button>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={concurrency}
                                onChange={(event) => {
                                    const nextValue = Number.parseInt(
                                        event.target.value,
                                        10,
                                    );
                                    setConcurrency(
                                        Number.isFinite(nextValue) &&
                                            nextValue > 0
                                            ? nextValue
                                            : 1,
                                    );
                                }}
                                disabled={isRunning}
                                style={{ width: 96, padding: "8px 10px" }}
                                aria-label="Concurrency"
                            />
                            <Button
                                onClick={() => inputRef.current?.click()}
                                disabled={isRunning}
                            >
                                Select Folder
                            </Button>
                        </Group>

                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            {...({ webkitdirectory: "" } as {
                                webkitdirectory: string;
                            })}
                            style={{ display: "none" }}
                            onChange={async (event) => {
                                const files = event.target.files;
                                if (!files || files.length === 0) return;

                                setIsRunning(true);
                                setResult(null);
                                setLogs([]);

                                try {
                                    let nextResult: MeasurementResult;
                                    if (mode === "raw-opfs") {
                                        setStatus(
                                            `Writing ${files.length.toLocaleString()} files to OPFS with concurrency ${concurrency}...`,
                                        );
                                        appendLog(
                                            `Using concurrency ${concurrency}.`,
                                        );
                                        nextResult = await writeDirectoryToOpfs(
                                            {
                                                files,
                                                concurrency,
                                                log: appendLog,
                                            },
                                        );
                                    } else {
                                        setStatus(
                                            mode === "book-json"
                                                ? `Scanning ${files.length.toLocaleString()} files and packing by book with concurrency ${concurrency}...`
                                                : `Scanning ${files.length.toLocaleString()} files and packing into one tn.json with concurrency ${concurrency}...`,
                                        );
                                        appendLog(
                                            `Using concurrency ${concurrency}.`,
                                        );
                                        nextResult =
                                            mode === "book-json"
                                                ? await writePackedBooksSerially(
                                                      files,
                                                      concurrency,
                                                      appendLog,
                                                  )
                                                : await writeSinglePackedJson(
                                                      files,
                                                      concurrency,
                                                      appendLog,
                                                  );
                                    }
                                    setResult(nextResult);
                                    setStatus("Finished.");
                                    appendLog("Finished.");
                                } catch (error) {
                                    setStatus(
                                        error instanceof Error
                                            ? `Failed: ${error.message}`
                                            : "Failed.",
                                    );
                                } finally {
                                    event.target.value = "";
                                    setIsRunning(false);
                                }
                            }}
                        />

                        <Text>{status}</Text>

                        {result ? (
                            <Table withTableBorder>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th>Files written</Table.Th>
                                        <Table.Td>
                                            {result.fileCount.toLocaleString()}
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Total bytes</Table.Th>
                                        <Table.Td>
                                            {formatBytes(result.totalBytes)}
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Elapsed</Table.Th>
                                        <Table.Td>
                                            {formatDuration(result.elapsedMs)}
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Throughput</Table.Th>
                                        <Table.Td>
                                            {(
                                                result.totalBytes /
                                                1024 /
                                                1024 /
                                                Math.max(
                                                    result.elapsedMs / 1000,
                                                    0.001,
                                                )
                                            ).toFixed(2)}{" "}
                                            MB/s
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Destination</Table.Th>
                                        <Table.Td>
                                            {result.destinationPath}
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        ) : null}

                        {logs.length > 0 ? (
                            <Card withBorder radius="md" padding="sm">
                                <Stack gap={4}>
                                    <Text fw={600}>Log</Text>
                                    {logs.map((line) => (
                                        <Text
                                            key={line}
                                            size="sm"
                                            ff="monospace"
                                        >
                                            {line}
                                        </Text>
                                    ))}
                                </Stack>
                            </Card>
                        ) : null}
                    </Stack>
                </Card>

                <Card withBorder radius="md" padding="lg">
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Stack gap={2}>
                                <Title order={3}>OPFS Project Folders</Title>
                                <Text c="dimmed">
                                    Top-level folders under the web projects
                                    root. Delete one here to test reconcile
                                    behavior against what is actually on disk.
                                </Text>
                            </Stack>
                            <Button
                                variant="light"
                                onClick={() => void refreshProjectFolders()}
                                loading={isRefreshingFolders}
                                disabled={Boolean(deletingFolderPath)}
                            >
                                Refresh
                            </Button>
                        </Group>

                        {projectFolders.length === 0 ? (
                            <Text c="dimmed">No project folders found.</Text>
                        ) : (
                            <Table withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Folder</Table.Th>
                                        <Table.Th>Path</Table.Th>
                                        <Table.Th style={{ width: 120 }}>
                                            Action
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {projectFolders.map((folder) => (
                                        <Table.Tr key={folder.path}>
                                            <Table.Td>{folder.name}</Table.Td>
                                            <Table.Td>{folder.path}</Table.Td>
                                            <Table.Td>
                                                <Button
                                                    color="red"
                                                    variant="light"
                                                    size="xs"
                                                    loading={
                                                        deletingFolderPath ===
                                                        folder.path
                                                    }
                                                    disabled={Boolean(
                                                        deletingFolderPath,
                                                    )}
                                                    onClick={async () => {
                                                        setDeletingFolderPath(
                                                            folder.path,
                                                        );
                                                        try {
                                                            await deleteTopLevelProjectFolder(
                                                                folder.path,
                                                            );
                                                            await refreshProjectFolders();
                                                        } finally {
                                                            setDeletingFolderPath(
                                                                null,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    Delete
                                                </Button>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )}
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
