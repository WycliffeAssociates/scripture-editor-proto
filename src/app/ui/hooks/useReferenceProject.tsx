import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { projectParamToParsedFiles } from "@/app/routes/$project";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository";

export type ReferenceProjectHook = ReturnType<typeof useReferenceProject>;

type Props = {
    projectRepository: IProjectRepository;
    pickedFileIdentifier: string;
    pickedChapterNumber: number;
};
export const useReferenceProject = ({
    projectRepository,
    pickedFileIdentifier,
    pickedChapterNumber,
}: Props) => {
    // todo: change to project
    const [referenceProjectId, setReferenceProjectId] = useState<string>();
    const referenceProjectQuery = useQuery({
        queryKey: ["projectFiles", referenceProjectId],
        queryFn: () =>
            projectParamToParsedFiles(projectRepository, referenceProjectId),
        enabled: !!referenceProjectId,
    });
    const referenceFile = useMemo(() => {
        return referenceProjectQuery.data?.parsedFiles.find(
            (f) => f.bookCode === pickedFileIdentifier,
        );
    }, [referenceProjectQuery.data, pickedFileIdentifier]);
    const referenceChapter = useMemo(() => {
        return referenceFile?.chapters?.[pickedChapterNumber];
    }, [referenceFile, pickedChapterNumber]);

    return {
        referenceQuery: referenceProjectQuery,
        referenceFile,
        referenceChapter,
        setReferenceProjectId,
        referenceProjectId,
    };
};

export type ReferenceProject = ReturnType<typeof useReferenceProject>;
