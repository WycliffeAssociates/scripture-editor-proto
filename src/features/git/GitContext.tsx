import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { GitService } from "./GitService";

type GitContextType = {
    gitService: GitService | null;
    isInitialized: boolean;
    error: Error | null;
};

const GitContext = createContext<GitContextType>({
    gitService: null,
    isInitialized: false,
    error: null,
});

export const GitProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [gitService, setGitService] = useState<GitService | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const initGitService = async () => {
            try {
                const service = await GitService.getInstance();
                setGitService(service);
                setIsInitialized(true);
            } catch (err) {
                console.error("Failed to initialize Git service:", err);
                setError(
                    err instanceof Error
                        ? err
                        : new Error("Failed to initialize Git service"),
                );
            }
        };

        initGitService();
    }, []);

    return (
        <GitContext.Provider value={{ gitService, isInitialized, error }}>
            {children}
        </GitContext.Provider>
    );
};

export const useGit = () => {
    const context = useContext(GitContext);

    if (context === undefined) {
        throw new Error("useGit must be used within a GitProvider");
    }

    if (context.error) {
        throw context.error;
    }

    if (!context.isInitialized || !context.gitService) {
        throw new Error("Git service is not initialized");
    }

    return context.gitService;
};

// Helper hook to check if Git is available
export const useGitAvailable = () => {
    const [isAvailable, setIsAvailable] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkGit = async () => {
            try {
                await GitService.getInstance();
                setIsAvailable(true);
            } catch (error) {
                console.warn("Git is not available:", error);
                setIsAvailable(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkGit();
    }, []);

    return { isAvailable, isLoading };
};
