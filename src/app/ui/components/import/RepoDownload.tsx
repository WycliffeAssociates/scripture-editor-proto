import { useQuery } from "@tanstack/react-query";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchUserOrOrgRepos, fetchUsersAndOrgs } from "@/core/persistence/git/giteaApi.ts";
import type {
    GiteaOrganization,
    GiteaRepository,
    GiteaUser,
} from "@/core/persistence/git/types.ts";
import { debounce } from "@/core/data/utils/generic.ts";
import AutocompleteInput, { type AutocompleteItem } from "@/app/ui/components/import/AutocompleteInput.tsx";

// Define the component's props interface
interface RepoDownloadProps {
    onDownload: (zipUrl: string) => void;
    isDownloadDisabled: boolean;
}

const RepoDownload: React.FC<RepoDownloadProps> = (props) => {
    // State for the user/organization search
    const [orgUserSearchTerm, setOrgUserSearchTerm] = useState("");
    const [debouncedOrgUserSearchTerm, setDebouncedOrgUserSearchTerm] =
        useState("");
    const [selectedOrgUser, setSelectedOrgUser] = useState<
        GiteaUser | GiteaOrganization | null
    >(null);

    // State for the repository search
    const [repoSearchTerm, setRepoSearchTerm] = useState("");
    const [debouncedRepoSearchTerm, setDebouncedRepoSearchTerm] = useState("");
    const [selectedRepo, setSelectedRepo] = useState<GiteaRepository | null>(
        null,
    );

    // Debounce the search terms to prevent excessive API calls
    useEffect(() => {
        const debouncedFn = debounce((term: string) => {
            setDebouncedOrgUserSearchTerm(term);
        }, 100);
        debouncedFn(orgUserSearchTerm);
        return () => {
            if (debouncedFn.cancel != undefined)
                return debouncedFn.cancel(); // Cleanup on unmount or dependency change
            else return () => {}
        }
    }, [orgUserSearchTerm]);

    useEffect(() => {
        const debouncedFn = debounce((term: string) => {
            setDebouncedRepoSearchTerm(term);
        }, 100);
        debouncedFn(repoSearchTerm);
        return () => {
            if (debouncedFn.cancel != undefined)
                return debouncedFn.cancel(); // Cleanup on unmount or dependency change
            else return () => {}
        }
    }, [repoSearchTerm]);

    // Query for users/organizations using TanStack Query
    const orgUserQuery = useQuery({
        queryKey: ["giteaUsersOrgs", debouncedOrgUserSearchTerm],
        queryFn: () => fetchUsersAndOrgs(debouncedOrgUserSearchTerm),
        enabled: debouncedOrgUserSearchTerm.length > 0,
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
            const type = "login" in selectedOrgUser ? "user" : "organization";
            const name = selectedOrgUser.login || selectedOrgUser.username;
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

    // Event handlers for state changes
    const handleSelectOrgUser = useCallback(
        (item: AutocompleteItem) => {
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
        [orgUserQuery.data],
    );

    const handleClearOrgUser = useCallback(() => {
        setSelectedOrgUser(null);
        setOrgUserSearchTerm("");
        setDebouncedOrgUserSearchTerm("");
        setRepoSearchTerm("");
        setDebouncedRepoSearchTerm("");
        setSelectedRepo(null);
    }, []);

    const handleSelectRepo = useCallback(
        (item: AutocompleteItem) => {
            const originalRepo = reposQuery.data?.find(
                (repo) => repo.name === item.name,
            );
            if (originalRepo) {
                setSelectedRepo(originalRepo);
                setRepoSearchTerm(item.name);
            }
        },
        [reposQuery.data],
    );

    const handleClearRepo = useCallback(() => {
        setSelectedRepo(null);
        setRepoSearchTerm("");
    }, []);

    // Modified function to call the onDownload prop with the zip URL
    const handleDownload = useCallback(() => {
        if (selectedRepo) {
            // Construct the URL based on the Gitea API documentation
            // This is a placeholder for the base URL; in a real app, this would be a config variable
            const giteaBaseUrl = "https://content.bibletranslationtools.org";
            const ownerName =
                selectedRepo.owner.login || selectedRepo.owner.username;
            const zipUrl = `${giteaBaseUrl}/api/v1/repos/${ownerName}/${selectedRepo.name}/archive/master.zip`;
            // Call the prop function with the constructed URL
            props.onDownload(zipUrl);
        }
    }, [selectedRepo, props.onDownload]);

    // Memoized data for the AutocompleteInput components
    const selectedOrgUserAutocompleteItem = useMemo(() => {
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

    const selectedRepoAutocompleteItem = useMemo(() => {
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
                onClear={handleClearOrgUser} // Added clear handler for completeness
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
                onClear={handleClearRepo} // Added clear handler for completeness
                selectedItem={selectedRepoAutocompleteItem}
                showAvatar={true}
                isLoading={reposQuery.isFetching}
                isError={reposQuery.isError}
                errorMessage={reposQuery.error?.message}
                showOnFocus={true}
                isDisabled={!selectedOrgUser} // Disable if no user/org is selected
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