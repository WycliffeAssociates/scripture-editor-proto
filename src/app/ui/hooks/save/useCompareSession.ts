import { useEffect, useRef, useSyncExternalStore } from "react";

import { CompareSessionController } from "@/app/domain/project/compare/CompareSessionController.ts";
import type {
  ChapterAddress,
  CompareSide,
  CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

/** React binding for the UI-free frozen comparison controller. */
export function useCompareSession(args: {
  workingFilesStore: WorkingFilesStore;
  usfmOnionService: IUsfmOnionService;
}) {
  const controllerRef = useRef<CompareSessionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new CompareSessionController(args);
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(
    () => () => {
      void controller.close();
    },
    [controller],
  );

  return {
    state,
    actions: {
      open: (sources: {
        left: CompareSourceDescriptor;
        right: CompareSourceDescriptor;
      }) => controller.open(sources),
      refresh: () => controller.refresh(),
      close: () => controller.close(),
      setUnitDecision: (
        address: ChapterAddress,
        unitId: string,
        decision: CompareSide | null,
      ) => controller.setUnitDecision(address, unitId, decision),
      setPresenceDecision: (
        address: ChapterAddress,
        decision: CompareSide | null,
      ) => controller.setPresenceDecision(address, decision),
      stampChapter: (address: ChapterAddress, decision: CompareSide | null) =>
        controller.stampChapter(address, decision),
      stampAll: (decision: CompareSide | null) => controller.stampAll(decision),
      beginApply: () => controller.beginApply(),
      completeApply: controller.completeApply.bind(controller),
      failApply: controller.failApply.bind(controller),
    },
  };
}
