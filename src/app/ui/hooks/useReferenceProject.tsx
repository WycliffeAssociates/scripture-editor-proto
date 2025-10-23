import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { projectParamToParsedFiles } from "@/app/routes/$project";
import type { IDirectoryProvider } from "@/core/data/persistence/DirectoryProvider";

export type ReferenceProjectHook = ReturnType<typeof useReferenceProject>;

type Props = {
    directoryProvider: IDirectoryProvider;
    pickedFileIdentifier: string;
    pickedChapterNumber: number;
};
export const useReferenceProject = ({
    directoryProvider,
    pickedFileIdentifier,
    pickedChapterNumber,
}: Props) => {
    const [referenceProjectPath, setReferenceProjectPath] = useState<string>();
    const referenceProjectQuery = useQuery({
        queryKey: ["projectFiles", referenceProjectPath],
        queryFn: () =>
            projectParamToParsedFiles(directoryProvider, referenceProjectPath),
        enabled: !!referenceProjectPath,
    });
    const referenceFile = useMemo(() => {
        return referenceProjectQuery.data?.find(
            (f) => f.bibleIdentifier === pickedFileIdentifier,
        );
    }, [referenceProjectQuery.data, pickedFileIdentifier]);
    const referenceChapter = useMemo(() => {
        return referenceFile?.chapters?.[pickedChapterNumber];
    }, [referenceFile, pickedChapterNumber]);

    return {
        referenceQuery: referenceProjectQuery,
        referenceFile,
        referenceChapter,
        setReferenceProjectPath,
        referenceProjectPath,
    };
};

export type ReferenceProject = ReturnType<typeof useReferenceProject>;
