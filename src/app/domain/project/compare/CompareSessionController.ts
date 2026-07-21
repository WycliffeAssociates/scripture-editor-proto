// CompareSessionController.ts
//
// Owns one frozen two-source review session. Source loading, decisions,
// projection, staleness, and cleanup meet here so React only renders a coherent
// external-store snapshot and never coordinates competing async effects.

import { Effect, Fiber, Stream } from "effect";

import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

import { buildCompareResultAsync } from "./compareService.ts";
import {
  clearDecisionScope,
  clearUnitDecision,
  createInitialDecisions,
  decisionsForChapter,
  iterateChapters,
  setChapterPresenceDecision,
  setUnitDecision,
  stampDecisionScope,
} from "./decisionState.ts";
import {
  projectCompareRevision,
  reduceProjectionState,
  type CompareProjectionArtifact,
  type CompareProjectionState,
  type PreviousCompareProjection,
} from "./projection.ts";
import { buildCompareSourcePair } from "./sourceDescriptors.ts";
import type {
  ChapterAddress,
  CompareChapterDecisions,
  CompareDecisionsByBook,
  CompareSession,
  CompareSide,
  CompareSourceDescriptor,
  CompareSourceMaterial,
  FrozenChapterComparison,
} from "./types.ts";

type SessionResources = Readonly<{
  left: CompareSourceMaterial;
  right: CompareSourceMaterial;
  workingFilesSnapshot: ReturnType<WorkingFilesStore["read"]> | null;
  workingGeneration: number | null;
}>;

export type CompareSessionControllerState =
  | Readonly<{ status: "closed" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "active";
      session: CompareSession;
      projection: CompareProjectionState;
      resources: SessionResources;
    }>;

export type CompareApplyContext = Readonly<{
  sessionId: string;
  revision: number;
  artifact: CompareProjectionArtifact;
  workingFilesSnapshot: ReturnType<WorkingFilesStore["read"]>;
}>;

type Listener = () => void;

export class CompareSessionController {
  private state: CompareSessionControllerState = Object.freeze({
    status: "closed",
  });
  private readonly listeners = new Set<Listener>();
  private sessionSequence = 0;
  private staleWatch: ReturnType<typeof Effect.runFork> | null = null;
  private displacedState: Extract<
    CompareSessionControllerState,
    { status: "active" }
  > | null = null;
  private projectionRunningSessionId: string | null = null;
  private previousProjection:
    | (PreviousCompareProjection & Readonly<{ sessionId: string }>)
    | null = null;

  constructor(
    private readonly deps: {
      workingFilesStore: WorkingFilesStore;
      usfmOnionService: IUsfmOnionService;
    },
  ) {}

  getSnapshot = (): CompareSessionControllerState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async open(args: {
    left: CompareSourceDescriptor;
    right: CompareSourceDescriptor;
  }): Promise<void> {
    const sequence = ++this.sessionSequence;
    this.previousProjection = null;
    this.stopStaleWatch();
    if (this.state.status === "active") {
      if (this.displacedState)
        await cleanupControllerState(this.displacedState);
      this.displacedState = this.state;
    }
    this.publish(Object.freeze({ status: "loading" }));
    const sources = buildCompareSourcePair(args);
    const startGeneration = this.deps.workingFilesStore.generation();
    const startContentGeneration =
      this.deps.workingFilesStore.contentGeneration();
    const workingStoreSnapshotAtStart =
      sources.writableSide === null ? null : this.deps.workingFilesStore.read();

    try {
      const [left, right] = await loadMaterials(
        sources.left.reload(),
        sources.right.reload(),
      );
      if (sequence !== this.sessionSequence) {
        await cleanupMaterials(left, right);
        return;
      }
      const snapshot = await buildCompareResultAsync({
        leftFiles: left.files,
        rightFiles: right.files,
        sources,
        leftMetadata: left.metadata,
        rightMetadata: right.metadata,
        usfmOnionService: this.deps.usfmOnionService,
      });
      if (sequence !== this.sessionSequence) {
        await cleanupMaterials(left, right);
        return;
      }

      const workingFilesSnapshot = workingStoreSnapshotAtStart;
      const changedDuringLoad =
        sources.writableSide !== null &&
        this.deps.workingFilesStore.contentGeneration() !==
          startContentGeneration;
      const lifecycle: CompareSession["lifecycle"] = changedDuringLoad
        ? { status: "stale", reason: "working-copy-changed" }
        : { status: "ready" };
      const session: CompareSession = Object.freeze({
        id: `compare-${sequence}`,
        snapshot,
        decisions: createInitialDecisions(snapshot),
        decisionRevision: 0,
        lifecycle,
      });
      const resources = Object.freeze({
        left,
        right,
        workingFilesSnapshot,
        workingGeneration:
          sources.writableSide === null ? null : startGeneration,
      });
      this.publish(
        Object.freeze({
          status: "active",
          session,
          projection: Object.freeze({ status: "idle", revision: 0 }),
          resources,
        }),
      );
      await this.cleanupDisplacedState();
      if (sequence !== this.sessionSequence) return;
      if (!changedDuringLoad && sources.writableSide !== null) {
        this.startStaleWatch(session.id, startGeneration);
      }
      this.startProjection(session.id);
    } catch (error) {
      if (sequence !== this.sessionSequence) return;
      await this.cleanupDisplacedState();
      const message = error instanceof Error ? error.message : String(error);
      const errorLifecycle: CompareSession["lifecycle"] = {
        status: "error",
        message,
      };
      const errorSession: CompareSession = Object.freeze({
        id: `compare-${sequence}`,
        snapshot: emptyCompareResult(sources),
        decisions: Object.freeze({}),
        decisionRevision: 0,
        lifecycle: errorLifecycle,
      });
      this.publish(
        Object.freeze({
          status: "active",
          session: errorSession,
          projection: Object.freeze({ status: "error", revision: 0, message }),
          resources: Object.freeze({
            left: emptyMaterial(),
            right: emptyMaterial(),
            workingFilesSnapshot: null,
            workingGeneration: null,
          }),
        }),
      );
    }
  }

  async refresh(): Promise<void> {
    const active = this.requireActive();
    await this.open({
      left: active.session.snapshot.sources.left,
      right: active.session.snapshot.sources.right,
    });
  }

  async close(): Promise<void> {
    ++this.sessionSequence;
    this.previousProjection = null;
    this.stopStaleWatch();
    const previous = this.state;
    this.publish(Object.freeze({ status: "closed" }));
    await Promise.allSettled([
      cleanupControllerState(previous),
      this.cleanupDisplacedState(),
    ]);
  }

  setUnitDecision(
    address: ChapterAddress,
    unitId: string,
    decision: CompareSide | null,
  ): void {
    this.updateChapterDecisions(address, (chapter, previous) => ({
      ...previous,
      units:
        decision === null
          ? clearUnitDecision({
              previous: previous.units,
              skeleton: chapter.skeleton,
              unitId,
            })
          : setUnitDecision({
              previous: previous.units,
              skeleton: chapter.skeleton,
              unitId,
              decision,
            }),
    }));
  }

  setPresenceDecision(
    address: ChapterAddress,
    decision: CompareSide | null,
  ): void {
    this.updateChapterDecisions(address, (chapter, previous) =>
      setChapterPresenceDecision({ chapter, previous, decision }),
    );
  }

  stampChapter(address: ChapterAddress, decision: CompareSide | null): void {
    this.updateChapterDecisions(address, (chapter, previous) => ({
      units:
        decision === null
          ? clearDecisionScope({
              previous: previous.units,
              skeleton: chapter.skeleton,
            })
          : stampDecisionScope({
              previous: previous.units,
              skeleton: chapter.skeleton,
              decision,
            }),
      presence:
        previous.presence === null && decision === null ? null : decision,
    }));
  }

  stampAll(decision: CompareSide | null): void {
    const active = this.requireWritableActive();
    let next = active.session.decisions;
    for (const chapter of iterateChapters(active.session.snapshot)) {
      next = replaceChapterDecisions(
        next,
        chapter,
        Object.freeze({
          units:
            decision === null
              ? clearDecisionScope({
                  previous: decisionsForChapter(next, chapter).units,
                  skeleton: chapter.skeleton,
                })
              : stampDecisionScope({
                  previous: decisionsForChapter(next, chapter).units,
                  skeleton: chapter.skeleton,
                  decision,
                }),
          presence: decision,
        }),
      );
    }
    this.publishDecisionUpdate(active, next);
  }

  beginApply(): CompareApplyContext {
    const active = this.requireWritableActive();
    if (active.session.lifecycle.status !== "ready") {
      throw new Error("Only a ready comparison can be applied.");
    }
    if (active.projection.status !== "ready") {
      throw new Error("The current comparison projection is not ready.");
    }
    if (!active.projection.artifact.complete) {
      throw new Error("Resolve every comparison decision before Apply.");
    }
    if (!active.resources.workingFilesSnapshot) {
      throw new Error("Writable comparison snapshot is missing.");
    }
    this.stopStaleWatch();
    const revision = active.session.decisionRevision;
    const lifecycle: CompareSession["lifecycle"] = {
      status: "applying",
      projectionRevision: revision,
    };
    this.publish(
      Object.freeze({
        ...active,
        session: Object.freeze({
          ...active.session,
          lifecycle,
        }),
      }),
    );
    return Object.freeze({
      sessionId: active.session.id,
      revision,
      artifact: active.projection.artifact,
      workingFilesSnapshot: active.resources.workingFilesSnapshot,
    });
  }

  completeApply(context: CompareApplyContext): void {
    const active = this.requireActive();
    if (
      active.session.id !== context.sessionId ||
      active.session.lifecycle.status !== "applying"
    ) {
      throw new Error("Apply completion does not match the active session.");
    }
    const lifecycle: CompareSession["lifecycle"] = {
      status: "applied",
      projectionRevision: context.revision,
    };
    this.publish(
      Object.freeze({
        ...active,
        session: Object.freeze({
          ...active.session,
          lifecycle,
        }),
      }),
    );
  }

  failApply(context: CompareApplyContext, error: unknown): void {
    const active = this.requireActive();
    if (active.session.id !== context.sessionId) return;
    const lifecycle: CompareSession["lifecycle"] = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    this.publish(
      Object.freeze({
        ...active,
        session: Object.freeze({
          ...active.session,
          lifecycle,
        }),
      }),
    );
  }

  private updateChapterDecisions(
    address: ChapterAddress,
    update: (
      chapter: FrozenChapterComparison,
      previous: CompareChapterDecisions,
    ) => CompareChapterDecisions,
  ): void {
    const active = this.requireWritableActive();
    const chapter =
      active.session.snapshot.chapters[address.bookCode]?.[address.chapterNum];
    if (!chapter) {
      throw new Error(
        `Unknown comparison chapter: ${address.bookCode} ${address.chapterNum}`,
      );
    }
    const previous = decisionsForChapter(active.session.decisions, chapter);
    const next = replaceChapterDecisions(
      active.session.decisions,
      chapter,
      Object.freeze(update(chapter, previous)),
    );
    this.publishDecisionUpdate(active, next);
  }

  private publishDecisionUpdate(
    active: Extract<CompareSessionControllerState, { status: "active" }>,
    decisions: CompareDecisionsByBook,
  ): void {
    const decisionRevision = active.session.decisionRevision + 1;
    const session = Object.freeze({
      ...active.session,
      decisions,
      decisionRevision,
    });
    this.publish(
      Object.freeze({
        ...active,
        session,
        projection: Object.freeze({
          status: "running",
          revision: decisionRevision,
        }),
      }),
    );
    this.startProjection(session.id);
  }

  private startProjection(sessionId: string): void {
    if (this.projectionRunningSessionId === sessionId) return;
    this.projectionRunningSessionId = sessionId;
    void this.runProjectionLoop(sessionId);
  }

  private async runProjectionLoop(sessionId: string): Promise<void> {
    try {
      while (true) {
        const active = this.state;
        if (
          active.status !== "active" ||
          active.session.id !== sessionId ||
          active.session.snapshot.sources.writableSide === null
        ) {
          return;
        }
        const revision = active.session.decisionRevision;
        this.publish(
          Object.freeze({
            ...active,
            projection: reduceProjectionState(active.projection, {
              type: "started",
              revision,
            }),
          }),
        );
        try {
          const artifact = await projectCompareRevision({
            snapshot: active.session.snapshot,
            decisions: active.session.decisions,
            revision,
            usfmOnionService: this.deps.usfmOnionService,
            previous:
              this.previousProjection?.sessionId === sessionId
                ? this.previousProjection
                : undefined,
          });
          const current = this.state;
          if (current.status !== "active" || current.session.id !== sessionId) {
            return;
          }
          this.previousProjection = Object.freeze({
            sessionId,
            artifact,
            decisions: active.session.decisions,
          });
          if (current.session.decisionRevision !== revision) continue;
          this.publish(
            Object.freeze({
              ...current,
              projection: reduceProjectionState(current.projection, {
                type: "completed",
                artifact,
              }),
            }),
          );
          return;
        } catch (error) {
          const current = this.state;
          if (current.status !== "active" || current.session.id !== sessionId) {
            return;
          }
          if (current.session.decisionRevision !== revision) continue;
          this.publish(
            Object.freeze({
              ...current,
              projection: reduceProjectionState(current.projection, {
                type: "failed",
                revision,
                message: error instanceof Error ? error.message : String(error),
              }),
            }),
          );
          return;
        }
      }
    } finally {
      if (this.projectionRunningSessionId === sessionId) {
        this.projectionRunningSessionId = null;
      }
    }
  }

  private async cleanupDisplacedState(): Promise<void> {
    const displaced = this.displacedState;
    this.displacedState = null;
    if (displaced) await cleanupControllerState(displaced);
  }

  private startStaleWatch(sessionId: string, startGeneration: number): void {
    this.staleWatch = Effect.runFork(
      Stream.runForEach(this.deps.workingFilesStore.changes, (event) =>
        Effect.sync(() => {
          if (
            event.meta.generation <= startGeneration ||
            !event.meta.dirtyTextContent
          ) {
            return;
          }
          const active = this.state;
          if (
            active.status !== "active" ||
            active.session.id !== sessionId ||
            active.session.lifecycle.status !== "ready"
          ) {
            return;
          }
          const lifecycle: CompareSession["lifecycle"] = {
            status: "stale",
            reason: "working-copy-changed",
          };
          this.publish(
            Object.freeze({
              ...active,
              session: Object.freeze({
                ...active.session,
                lifecycle,
              }),
            }),
          );
        }),
      ),
    );
  }

  private stopStaleWatch(): void {
    if (!this.staleWatch) return;
    Effect.runFork(Fiber.interrupt(this.staleWatch));
    this.staleWatch = null;
  }

  private requireActive(): Extract<
    CompareSessionControllerState,
    { status: "active" }
  > {
    if (this.state.status !== "active") {
      throw new Error("No comparison session is open.");
    }
    return this.state;
  }

  private requireWritableActive(): Extract<
    CompareSessionControllerState,
    { status: "active" }
  > {
    const active = this.requireActive();
    if (active.session.snapshot.sources.writableSide === null) {
      throw new Error("Read-only comparisons do not have decisions.");
    }
    if (active.session.lifecycle.status === "applied") {
      throw new Error("The comparison has already been applied.");
    }
    return active;
  }

  private publish(state: CompareSessionControllerState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function replaceChapterDecisions(
  previous: CompareDecisionsByBook,
  chapter: FrozenChapterComparison,
  decisions: CompareChapterDecisions,
): CompareDecisionsByBook {
  const bookCode = chapter.address.bookCode;
  return Object.freeze({
    ...previous,
    [bookCode]: Object.freeze({
      ...previous[bookCode],
      [chapter.address.chapterNum]: decisions,
    }),
  });
}

async function cleanupMaterials(
  left: CompareSourceMaterial | null,
  right: CompareSourceMaterial | null,
): Promise<void> {
  const cleanups = [left?.cleanup, right?.cleanup].filter(
    (cleanup): cleanup is () => Promise<void> => cleanup !== undefined,
  );
  await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
}

async function loadMaterials(
  leftLoad: Promise<CompareSourceMaterial>,
  rightLoad: Promise<CompareSourceMaterial>,
): Promise<readonly [CompareSourceMaterial, CompareSourceMaterial]> {
  const [left, right] = await Promise.allSettled([leftLoad, rightLoad]);
  if (left.status === "fulfilled" && right.status === "fulfilled") {
    return [left.value, right.value];
  }
  await cleanupMaterials(
    left.status === "fulfilled" ? left.value : null,
    right.status === "fulfilled" ? right.value : null,
  );
  if (left.status === "rejected") throw left.reason;
  if (right.status === "rejected") throw right.reason;
  throw new Error("Compare source loading failed without a rejection reason.");
}

async function cleanupControllerState(
  state: CompareSessionControllerState,
): Promise<void> {
  if (state.status !== "active") return;
  await cleanupMaterials(state.resources.left, state.resources.right);
}

function emptyMaterial(): CompareSourceMaterial {
  return Object.freeze({ files: [] });
}

function emptyCompareResult(
  sources: ReturnType<typeof buildCompareSourcePair>,
): CompareSession["snapshot"] {
  return Object.freeze({
    sources,
    chapters: Object.freeze({}),
    warnings: Object.freeze([]),
    coverage: Object.freeze({
      leftOnly: Object.freeze([]),
      rightOnly: Object.freeze([]),
      overlapping: Object.freeze([]),
    }),
    changedUnitCount: 0,
  });
}
