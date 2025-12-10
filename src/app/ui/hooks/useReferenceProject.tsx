import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { projectParamToParsedFiles } from "@/app/domain/api/projectToParsed.tsx";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

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
    const [referenceProjectId, setReferenceProjectId] = useState<string>();
    const { md5Service } = useRouter().options.context;
    const referenceProjectQuery = useQuery({
        queryKey: ["projectFiles", referenceProjectId],
        queryFn: () =>
            projectParamToParsedFiles(
                projectRepository,
                referenceProjectId,
                md5Service,
            ),
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
