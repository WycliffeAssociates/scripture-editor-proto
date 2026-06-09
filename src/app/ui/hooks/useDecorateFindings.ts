// useDecorateFindings.ts
//
// Assembles the generic capability context ONCE at the React edge and returns
// the decorate function surfaces apply to normalized findings. This is the
// single place capabilities meet decorators — no surface threads per-feature
// callbacks anymore (see decorators/decorateFinding.tsx).

import { useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import {
    decorateFinding,
    type FindingDecorationContext,
} from "@/app/domain/editor/annotations/decorators/decorateFinding.tsx";
import type {
    DecoratedFinding,
    Finding,
} from "@/app/domain/editor/annotations/finding.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function useDecorateFindings(): (finding: Finding) => DecoratedFinding {
    const {
        workingFilesStore,
        interactionGate,
        history,
        findingsStore,
        project,
        workspaceModalStore,
    } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const editorMode = project.appSettings.editorMode;

    return useMemo(() => {
        const ctx: FindingDecorationContext = {
            workingFilesStore,
            interactionGate,
            history,
            usfmOnionService,
            editorMode,
            findingsStore,
            openModal: workspaceModalStore.open,
            closeModal: workspaceModalStore.close,
        };
        return (finding: Finding) => decorateFinding(finding, ctx);
    }, [
        workingFilesStore,
        interactionGate,
        history,
        usfmOnionService,
        editorMode,
        findingsStore,
        workspaceModalStore,
    ]);
}
