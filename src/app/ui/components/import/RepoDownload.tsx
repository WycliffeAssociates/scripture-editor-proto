import { useDebouncedState } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AutocompleteInput, {
    type AutocompleteItem,
} from "@/app/ui/components/import/AutoCompleteInput.tsx";
import {
    fetchUserOrOrgRepos,
    fetchUsersAndOrgs,
} from "@/core/persistence/git/giteaApi.ts";
import type {
    GiteaOrganization,
    GiteaRepository,
    GiteaUser,
} from "@/core/persistence/git/types.ts";

// Define the component's props interface
interface RepoDownloadProps {
    onDownload: (zipUrl: string) => void;
    isDownloadDisabled: boolean;
}

const RepoDownload: React.FC<RepoDownloadProps> = (props) => {
    // State for the user/organization search
    const [orgUserSearchTerm, setOrgUserSearchTerm] = useDebouncedState(
        "",
        500,
    );
    const [selectedOrgUser, setSelectedOrgUser] = useState<
        GiteaUser | GiteaOrganization | null
    >(null);

    // State for the repository search
    const [repoSearchTerm, setRepoSearchTerm] = useDebouncedState("", 500);
    const [selectedRepo, setSelectedRepo] = useState<GiteaRepository | null>(
        null,
    );

    // Query for users/organizations using TanStack Query
    const orgUserQuery = useQuery({
        queryKey: ["giteaUsersOrgs", orgUserSearchTerm],
        queryFn: () => fetchUsersAndOrgs(orgUserSearchTerm),
        enabled: orgUserSearchTerm.length > 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    // Memoized results for the user/org autocomplete
    const orgUserResults = useMemo<AutocompleteItem[]>(() => {
        if (orgUserQuery.isSuccess && orgUserQuery.data) {
            return orgUserQuery.data.map((item) => ({
                id: item.id,
                name: "login" in item ? item.login : item.username,
                avatar_url: item.avatar_url,
                type: "login" in item ? "user" : "organization",
            }));
        }
        return [];
    }, [orgUserQuery.isSuccess, orgUserQuery.data]);

    // Query for repositories belonging to the selected user/organization
    const selectedOrgUserName = useMemo(() => {
        if (!selectedOrgUser) return "";
        return "login" in selectedOrgUser
            ? selectedOrgUser.login
            : selectedOrgUser.username;
    }, [selectedOrgUser]);

    const reposQuery = useQuery({
        queryKey: ["giteaRepos", selectedOrgUser?.id, selectedOrgUserName],
        queryFn: () => {
            if (!selectedOrgUser) return Promise.resolve([]);
            let name: string;
            let type: "user" | "organization";
            if ("login" in selectedOrgUser) {
                name = selectedOrgUser.login;
                type = "user";
            } else {
                name = selectedOrgUser.username;
                type = "organization";
            }
            return fetchUserOrOrgRepos(type, name);
        },
        enabled: !!selectedOrgUser,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    // Memoized filtered results for the repo autocomplete
    const filteredRepoResults = useMemo<AutocompleteItem[]>(() => {
        const term = repoSearchTerm.toLowerCase();
        if (reposQuery.isSuccess && reposQuery.data) {
            return reposQuery.data
                .filter((repo) => repo.name.toLowerCase().includes(term))
                .map((repo) => ({
                    id: repo.id,
                    name: repo.name,
                    avatar_url: repo.owner.avatar_url,
                    type: "repo",
                }));
        }
        return [];
    }, [reposQuery.isSuccess, reposQuery.data, repoSearchTerm]);

    const handleClearOrgUser = useCallback(() => {
        setSelectedOrgUser(null);
        setOrgUserSearchTerm("");
        setRepoSearchTerm("");
        setSelectedRepo(null);
    }, [setOrgUserSearchTerm, setRepoSearchTerm]);

    // Event handlers for state changes
    const handleSelectOrgUser = useCallback(
        (item: AutocompleteItem | null) => {
            if (!item) {
                handleClearOrgUser();
                return;
            }
            const originalItem = orgUserQuery.data?.find(
                (ou) => ("login" in ou ? ou.login : ou.username) === item.name,
            );
            if (originalItem) {
                setSelectedOrgUser(originalItem);
                setOrgUserSearchTerm(item.name);
                setRepoSearchTerm("");
                setSelectedRepo(null);
            }
        },
        [
            orgUserQuery.data,
            setOrgUserSearchTerm,
            setRepoSearchTerm,
            handleClearOrgUser,
        ],
    );

    const handleClearRepo = useCallback(() => {
        setSelectedRepo(null);
        setRepoSearchTerm("");
    }, [setRepoSearchTerm]);

    const handleSelectRepo = useCallback(
        (item: AutocompleteItem | null) => {
            if (!item) {
                handleClearRepo();
                return;
            }
            const originalRepo = reposQuery.data?.find(
                (repo) => repo.name === item.name,
            );
            if (originalRepo) {
                setSelectedRepo(originalRepo);
                setRepoSearchTerm(item.name);
            }
        },
        [reposQuery.data, setRepoSearchTerm, handleClearRepo],
    );

    // Modified function to call the onDownload prop with the zip URL
    const handleDownload = useCallback(() => {
        if (selectedRepo) {
            // Construct the URL based on the Gitea API documentation
            // This is a placeholder for the base URL; in a real app, this would be a config variable
            // todo: make env var
            const giteaBaseUrl = "https://content.bibletranslationtools.org";
            const ownerName =
                "login" in selectedRepo.owner
                    ? selectedRepo.owner.login
                    : selectedRepo.owner.username;
            const zipUrl = `${giteaBaseUrl}/api/v1/repos/${ownerName}/${selectedRepo.name}/archive/master.zip`;
            // Call the prop function with the constructed URL
            props.onDownload(zipUrl);
        }
    }, [
        selectedRepo,
        props.onDownload, // Call the prop function with the constructed URL
        props,
    ]);

    // Memoized data for the AutocompleteInput components
    const selectedOrgUserAutocompleteItem: AutocompleteItem | null =
        useMemo(() => {
            if (selectedOrgUser) {
                return {
                    id: selectedOrgUser.id,
                    name:
                        "login" in selectedOrgUser
                            ? selectedOrgUser.login
                            : selectedOrgUser.username,
                    avatar_url: selectedOrgUser.avatar_url,
                    type: "login" in selectedOrgUser ? "user" : "organization",
                };
            }
            return null;
        }, [selectedOrgUser]);

    const selectedRepoAutocompleteItem: AutocompleteItem | null =
        useMemo(() => {
            if (selectedRepo) {
                return {
                    id: selectedRepo.id,
                    name: selectedRepo.name,
                    avatar_url: selectedRepo.owner.avatar_url,
                    type: "repo",
                };
            }
            return null;
        }, [selectedRepo]);

    return (
        <div>
            {/*<Modal isOpen={props.isOpen} onClose={props.onClose} title="Download Repository">*/}
            <AutocompleteInput
                label="Organization or User"
                placeholder="Search for an organization or user..."
                searchTerm={orgUserSearchTerm}
                setSearchTerm={setOrgUserSearchTerm}
                results={orgUserResults}
                onSelect={handleSelectOrgUser}
                selectedItem={selectedOrgUserAutocompleteItem}
                showAvatar={true}
                isLoading={orgUserQuery.isFetching}
                isError={orgUserQuery.isError}
                errorMessage={orgUserQuery.error?.message}
            />

            <AutocompleteInput
                label="Repository"
                placeholder="Search for a repository..."
                searchTerm={repoSearchTerm}
                setSearchTerm={setRepoSearchTerm}
                results={filteredRepoResults}
                onSelect={handleSelectRepo}
                selectedItem={selectedRepoAutocompleteItem}
                showAvatar={true}
                isLoading={reposQuery.isFetching}
                isError={reposQuery.isError}
                errorMessage={reposQuery.error?.message}
                showOnFocus={true}
            />

            <button
                type="button" // Use type="button" for general buttons
                onClick={handleDownload}
                disabled={props.isDownloadDisabled || !selectedRepo} // Also disable if no repo is selected
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Download Repository
            </button>
            {/*</Modal>*/}
        </div>
    );
};

export default RepoDownload;
