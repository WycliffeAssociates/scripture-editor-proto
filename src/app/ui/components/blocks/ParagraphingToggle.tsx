import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Group, Modal, rem, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Stamp } from "lucide-react";
import {
    extractMarkersFromSerialized,
    stripMarkersFromSerialized,
} from "@/app/domain/editor/utils/paragraphingUtils.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useParagraphing } from "@/app/ui/contexts/ParagraphingContext.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { VALID_NOTE_MARKERS } from "@/core/data/usfm/tokens.ts";

export function ParagraphingToggle() {
    const { t } = useLingui();
    const {
        isParagraphingActive,
        activateParagraphingMode,
        deactivateParagraphingMode,
        setParagraphingSnapshot,
    } = useParagraphing();
    const { referenceProject, editorRef, isProcessing, actions, project } =
        useWorkspaceContext();
    const [opened, { open, close }] = useDisclosure(false);

    if (!referenceProject.referenceProjectId) return null;

    const handleClick = () => {
        if (isParagraphingActive) {
            deactivateParagraphingMode();
        } else {
            open();
        }
    };

    const handleActivate = async (cleanSlate: boolean) => {
        const { referenceChapter } = referenceProject;
        const pickedChapter = project.pickedChapter;
        const pickedFile = project.pickedFile;

        if (!referenceChapter) {
            notifications.show({
                title: t`Error`,
                message: t`Please select a reference project first.`,
                color: "red",
            });
            close();
            return;
        }

        const markers = extractMarkersFromSerialized(
            referenceChapter.lexicalState.root.children,
        ).filter((marker) => {
            if (marker.type === "c") return false;
            if (VALID_NOTE_MARKERS.has(marker.type)) return false;
            if (!cleanSlate && marker.type === "v") return false;
            return true;
        });

        if (!editorRef.current || !pickedChapter || !pickedFile) {
            notifications.show({
                title: t`Error`,
                message: t`The editor is not ready yet. Please try again.`,
                color: "red",
            });
            close();
            return;
        }

        const currentEditorState = editorRef.current.getEditorState();
        const serialized = currentEditorState.toJSON();
        const wasDirty =
            JSON.stringify(serialized) !==
            JSON.stringify(pickedChapter.loadedLexicalState);

        setParagraphingSnapshot({
            fileBibleIdentifier: pickedFile.bookCode,
            chapterNumber: pickedChapter.chapNumber,
            serializedState: structuredClone(serialized),
            wasDirty,
        });

        if (cleanSlate) {
            const cleanedChildren = stripMarkersFromSerialized(
                serialized.root.children,
            );

            const newSerialized = {
                ...serialized,
                root: {
                    ...serialized.root,
                    children: cleanedChildren,
                },
            };

            actions.updateChapterLexical({
                fileBibleIdentifier: pickedFile.bookCode,
                chap: pickedChapter.chapNumber,
                newLexical: newSerialized,
                isDirty: true,
            });
            actions.setEditorContent(
                pickedFile.bookCode,
                pickedChapter.chapNumber,
                undefined,
            );
        }

        activateParagraphingMode(markers);
        close();
    };

    return (
        <>
            <Tooltip
                label={<Trans>Paragraphing Mode</Trans>}
                withArrow
                position="top"
            >
                <ActionIconSimple
                    onClick={handleClick}
                    aria-label={t`Paragraphing Mode`}
                    variant={isParagraphingActive ? "filled" : "subtle"}
                    disabled={isProcessing}
                >
                    <Stamp size={rem(14)} />
                </ActionIconSimple>
            </Tooltip>

            <Modal
                opened={opened}
                onClose={close}
                title={<Trans>Enter Paragraphing Mode</Trans>}
            >
                <Text size="sm" mb="lg">
                    <Trans>
                        This mode allows you to apply formatting from the
                        reference text. Do you want to strip existing formatting
                        (Clean Slate) or keep it?
                    </Trans>
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>
                        <Trans>Cancel</Trans>
                    </Button>
                    <Button
                        variant="light"
                        onClick={() => handleActivate(false)}
                    >
                        <Trans>Keep Formatting</Trans>
                    </Button>
                    <Button color="red" onClick={() => handleActivate(true)}>
                        <Trans>Clean Slate</Trans>
                    </Button>
                </Group>
            </Modal>
        </>
    );
}
