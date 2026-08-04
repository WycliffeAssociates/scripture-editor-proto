import type { CorpusScope, FormatOptions, Token } from "usfm-onion-web";

import type { TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { MirrorFeed } from "./MirrorFeed.ts";
import type { BraidPublication, LoadProjectResult } from "./mirrorProtocol.ts";
import type { LoadProjectRequest } from "./mirrorSessionFactory.ts";

type ResidentBraidBooks = {
  books: Record<string, Token[]>;
  usfm: Record<string, string>;
};

/** Main-thread client for the resident Braid formatter behind a mirror feed. */
export function formatResidentBraid(args: {
  feed: MirrorFeed;
  generation: number;
  scope: CorpusScope;
  options?: FormatOptions;
}): Promise<{ books: Record<string, Token[]>; usfm: Record<string, string> }> {
  const requestId = `braid-format-${args.generation}-${Math.random().toString(36).slice(2)}`;
  const retryDelays = [50, 150, 300];
  return new Promise((resolve, reject) => {
    let attempt = 0;
    let off = () => {};
    const send = () => {
      off();
      off = args.feed.onResult((result) => {
        if (
          result.kind === "formatBraidResult" &&
          result.requestId === requestId
        ) {
          if (result.behind && attempt < retryDelays.length) {
            const delay = retryDelays[attempt++];
            setTimeout(send, delay);
            return;
          }
          off();
          if (result.behind) {
            reject(new Error("Resident Braid is behind the requested format"));
          } else if (result.superseded) {
            reject(
              new Error("Resident Braid advanced during the requested format"),
            );
          } else {
            resolve({ books: result.books, usfm: result.usfm });
          }
        }
        if (
          result.kind === "braidCommandError" &&
          result.requestId === requestId &&
          result.operation === "formatBraid"
        ) {
          off();
          reject(new Error(result.error));
        }
        if (result.kind === "resyncRequest") {
          off();
          reject(
            new Error("Resident Braid lost its corpus; retry after resync"),
          );
        }
      });
      args.feed.sendCommand({
        kind: "formatBraid",
        generation: args.generation,
        requestId,
        scope: args.scope,
        options: args.options,
      });
    };
    send();
  });
}

export function publishResidentBraid(args: {
  feed: MirrorFeed;
  generation: number;
}): Promise<BraidPublication> {
  const requestId = `braid-publish-${args.generation}-${Math.random().toString(36).slice(2)}`;
  const retryDelays = [50, 150, 300];

  return new Promise((resolve, reject) => {
    let attempt = 0;
    let off = () => {};
    const send = () => {
      off();
      off = args.feed.onResult((result) => {
        if (
          result.kind === "publishBraidResult" &&
          result.requestId === requestId
        ) {
          if (result.behind && attempt < retryDelays.length) {
            const delay = retryDelays[attempt++];
            setTimeout(send, delay);
            return;
          }
          off();
          if (result.behind) {
            reject(new Error("Resident Braid is behind the requested save"));
          } else if (result.superseded) {
            reject(
              new Error("Resident Braid advanced during the requested save"),
            );
          } else {
            if (!result.publication) {
              reject(new Error("Resident Braid returned no publication"));
            } else {
              resolve(result.publication);
            }
          }
        }
        if (
          result.kind === "braidCommandError" &&
          result.requestId === requestId &&
          result.operation === "publishBraid"
        ) {
          off();
          reject(new Error(result.error));
        }
        if (result.kind === "resyncRequest") {
          off();
          reject(
            new Error("Resident Braid lost its corpus; retry after resync"),
          );
        }
      });
      args.feed.sendCommand({
        kind: "publishBraid",
        generation: args.generation,
        requestId,
      });
    };
    send();
  });
}

export function loadProjectResident(
  args: LoadProjectRequest & { feed: MirrorFeed },
): Promise<LoadProjectResult> {
  // No timer here: the startup trace measures this span as `main:host:load`.
  return new Promise((resolve) => {
    let off = () => {};
    off = args.feed.onResult((result) => {
      if (
        result.kind === "loadProjectResult" &&
        result.ranAtGeneration === args.generation &&
        result.projectPath === args.projectPath
      ) {
        off();
        resolve(result);
      }
    });
    args.feed.sendCommand({
      kind: "loadProject",
      generation: args.generation,
      projectPath: args.projectPath,
      workspaceKey: args.workspaceKey,
      books: args.books,
      config: args.config,
      analysisDisabled: args.analysisDisabled,
    });
  });
}

/**
 * Apply a finding's snapshot-bound fix through the resident Braid. The host
 * owns the patch lookup and stale-generation retry; the caller only receives
 * the authoritative changed-book projection to commit into WorkingFilesStore.
 */
export function applyResidentBraidFix(args: {
  feed: MirrorFeed;
  generation: number;
  bookCode: string;
  fix: TokenFix;
}): Promise<ResidentBraidBooks> {
  const requestId = `braid-fix-${args.generation}-${Math.random().toString(36).slice(2)}`;
  const retryDelays = [50, 150, 300];

  return new Promise((resolve, reject) => {
    let attempt = 0;
    let off = () => {};
    const send = () => {
      off();
      off = args.feed.onResult((result) => {
        if (
          result.kind === "applyBraidFixResult" &&
          result.requestId === requestId
        ) {
          if (result.behind && attempt < retryDelays.length) {
            const delay = retryDelays[attempt++];
            setTimeout(send, delay);
            return;
          }
          off();
          if (result.behind) {
            reject(new Error("Resident Braid is behind the requested fix"));
          } else if (result.superseded) {
            reject(
              new Error("Resident Braid advanced during the requested fix"),
            );
          } else {
            resolve({ books: result.books, usfm: result.usfm });
          }
        }
        if (
          result.kind === "braidCommandError" &&
          result.requestId === requestId &&
          result.operation === "applyBraidFix"
        ) {
          off();
          reject(new Error(result.error));
        }
        if (result.kind === "resyncRequest") {
          off();
          reject(
            new Error("Resident Braid lost its corpus; retry after resync"),
          );
        }
      });
      args.feed.sendCommand({
        kind: "applyBraidFix",
        generation: args.generation,
        requestId,
        bookCode: args.bookCode,
        fix: args.fix,
      });
    };
    send();
  });
}
