import React, {createContext, ReactNode, useContext} from "react";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
import {IProjectRepository} from "@/core/persistence/ProjectRepository.ts";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {ProjectRepository} from "@/core/persistence/repositories/ProjectRepository.ts";

interface PersistenceContextType {
    directoryProvider: IDirectoryProvider;
    projectRepository: IProjectRepository,
    md5Service: IMd5Service;
}

const PersistenceContext = createContext<PersistenceContextType | undefined>(undefined);

export const PersistenceProvider: React.FC<{
    children: ReactNode;
    directoryProvider: IDirectoryProvider;
    md5Service: IMd5Service
}> = (
    {
        children,
        directoryProvider,
        md5Service,
    }
) => {
    const projectRepository = new ProjectRepository(directoryProvider, md5Service);

    const contextValue: PersistenceContextType = {
        directoryProvider,
        projectRepository,
        md5Service,
    };

    return (
        <PersistenceContext.Provider value={contextValue}>
            {children}
        </PersistenceContext.Provider>
    );
};

export const usePersistence = (): PersistenceContextType => {
    const context = useContext(PersistenceContext);
    if (context === undefined) {
        throw new Error("usePersistence must be used within a PersistenceProvider");
    }
    return context;
};