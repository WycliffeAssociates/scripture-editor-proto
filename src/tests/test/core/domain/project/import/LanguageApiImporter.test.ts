import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type ConsolidatedRepo,
    fetchConsolidatedRepos,
    formatRepoDisplay,
    getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("LanguageApiImporter", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("fetchConsolidatedRepos", () => {
        it("should fetch and return consolidated repos", async () => {
            const mockRepos: ConsolidatedRepo[] = [
                {
                    language_ietf: "abz",
                    language_name: "Abui",
                    repo_url:
                        "https://content.bibletranslationtools.org/rbnswartz/merged-abz",
                    title: null,
                    language_english_name: "Abui",
                    repo_name: "merged-abz",
                    username: "rbnswartz",
                },
            ];

            const mockResponse = {
                vw_consolidated_repos: mockRepos,
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await fetchConsolidatedRepos();

            expect(result).toEqual(mockRepos);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.bibleineverylanguage.org/api/rest/consolidated-repos",
            );
        });

        it("should throw error on non-ok response", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
            });

            await expect(fetchConsolidatedRepos()).rejects.toThrow(
                "Language API error: 500",
            );
        });

        it("should use VITE_LANGUAGE_API_URL when set", async () => {
            const customUrl = "https://custom.api.example.com/repos";
            vi.stubEnv("VITE_LANGUAGE_API_URL", customUrl);

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ vw_consolidated_repos: [] }),
            });

            await fetchConsolidatedRepos();

            expect(mockFetch).toHaveBeenCalledWith(customUrl);

            vi.unstubAllEnvs();
        });
    });

    describe("formatRepoDisplay", () => {
        const repos: ConsolidatedRepo[] = [
            {
                language_ietf: "abz",
                language_name: "Abui",
                repo_url: "https://content.example.org/user1/abui",
                title: null,
                language_english_name: "Abui",
                repo_name: "abui",
                username: "user1",
            },
            {
                language_ietf: "es",
                language_name: "Español",
                repo_url: "https://content.example.org/user2/spanish-bible",
                title: "Spanish Bible",
                language_english_name: "Spanish",
                repo_name: "spanish-bible",
                username: "user2",
            },
            {
                language_ietf: "es",
                language_name: "Español",
                repo_url: "https://content.example.org/user3/new-testament",
                title: "New Testament",
                language_english_name: "Spanish",
                repo_name: "new-testament",
                username: "user3",
            },
            {
                language_ietf: "es",
                language_name: "Español",
                repo_url: "https://content.example.org/user4/bible-translation",
                title: "Bible Translation",
                language_english_name: "Spanish",
                repo_name: "bible-translation",
                username: "user4",
            },
            {
                language_ietf: "es",
                language_name: "Español",
                repo_url:
                    "https://content.example.org/user5/bible-translation-alt",
                title: "Bible Translation",
                language_english_name: "Spanish",
                repo_name: "bible-translation-alt",
                username: "user5",
            },
        ];

        it("should display username/repo when no title", () => {
            const result = formatRepoDisplay(repos[0], repos);
            expect(result).toBe("user1/abui");
        });

        it("should show title when title exists and no conflict", () => {
            const result = formatRepoDisplay(repos[1], repos);
            expect(result).toBe("Spanish Bible");
        });

        it("should add username/repo when no title exists", () => {
            const result = formatRepoDisplay(repos[0], repos);
            expect(result).toContain("user1/abui");
        });

        it("should add differentiator when title conflicts exist", () => {
            const result = formatRepoDisplay(repos[4], repos);
            expect(result).toContain("user5/bible-translation-alt");
        });
    });

    describe("getZipUrl", () => {
        const mockRepo: ConsolidatedRepo = {
            language_ietf: "abz",
            language_name: "Abui",
            repo_url:
                "https://content.bibletranslationtools.org/rbnswartz/merged-abz",
            title: null,
            language_english_name: "Abui",
            repo_name: "merged-abz",
            username: "rbnswartz",
        };

        it("should return master branch zip url when available", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
            });

            const result = await getZipUrl(mockRepo);

            expect(result).toBe(
                "https://content.bibletranslationtools.org/rbnswartz/merged-abz/archive/master.zip",
            );
        });

        it("should fallback to main branch when master fails", async () => {
            mockFetch
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValueOnce({
                    ok: true,
                });

            const result = await getZipUrl(mockRepo);

            expect(result).toBe(
                "https://content.bibletranslationtools.org/rbnswartz/merged-abz/archive/main.zip",
            );
        });

        it("should throw error when both branches fail", async () => {
            mockFetch.mockRejectedValue(new Error("Network error"));

            await expect(getZipUrl(mockRepo)).rejects.toThrow(
                "Unable to find archive for https://content.bibletranslationtools.org/rbnswartz/merged-abz",
            );
        });
    });
});
