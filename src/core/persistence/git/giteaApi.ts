import type {
  GiteaOrganization,
  GiteaRepository,
  GiteaUser,
} from "@/core/persistence/git/types.ts";

const GITEA_API_URL = "https://content.bibletranslationtools.org/api/v1"; // <<< REMEMBER TO CHANGE THIS
const GITEA_ACCESS_TOKEN = "YOUR_GITEA_ACCESS_TOKEN"; // <<< REMEMBER TO CHANGE THIS

const headers = {
  //Authorization: `token ${GITEA_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  //   todo: env var
  "User-Agent": "wacs-live-reader",
};

async function fetchGitea<T>(
  endpoint: string,
  params?: Record<string, any>
): Promise<T> {
  console.log("Fetching Gitea API:", endpoint, params);
  const url = new URL(`${GITEA_API_URL}${endpoint}`);
  if (params) {
    Object.keys(params).forEach((key) => {
      url.searchParams.append(key, params[key]);
    });
  }

  const response = await fetch(url.toString(), {headers});

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({message: response.statusText}));
    throw new Error(
      `Gitea API Error: ${response.status} - ${
        errorBody.message || "Unknown error"
      }`
    );
  }

  return response.json();
}

export async function fetchUsersAndOrgs(
  query: string
): Promise<(GiteaUser | GiteaOrganization)[]> {
  if (!query) {
    return [];
  }
  try {
    const [userSearchResponse, orgsList] = await Promise.all([
      fetchGitea<{data: GiteaUser[]}>("/users/search", {
        q: query,
        limit: 10,
      }),
      fetchGitea<GiteaOrganization[]>("/orgs"),
    ]);

    const users = userSearchResponse.data || [];
    const lowerCaseQuery = query.toLowerCase();
    const filteredOrgs = orgsList.filter(
      (org) =>
        org.username.toLowerCase().includes(lowerCaseQuery) ||
        (org.full_name && org.full_name.toLowerCase().includes(lowerCaseQuery))
    );

    const combined = [...users, ...filteredOrgs];
    const unique = new Map<string, GiteaUser | GiteaOrganization>();
    combined.forEach((item) => {
      const key = "login" in item ? item.login : item.username;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    });

    return Array.from(unique.values()).slice(0, 10);
  } catch (error) {
    console.error("Error fetching users/orgs:", error);
    try {
      console.warn("Falling back to user-only search.");
      const response = await fetchGitea<{data: GiteaUser[]}>("/users/search", {
        q: query,
        limit: 10,
      });
      return response.data || [];
    } catch (fallbackError) {
      console.error("Fallback user search also failed:", fallbackError);
      throw error;
    }
  }
}

export async function fetchUserOrOrgRepos(
  type: "user" | "organization",
  name: string
): Promise<GiteaRepository[]> {
  if (!name) {
    return [];
  }
  const endpoint =
    type === "user" ? `/users/${name}/repos` : `/orgs/${name}/repos`;

  try {
    const limit = 50; // A common page size
    const maxPages = 10; // Fetch up to 20 pages as requested

    // Create an array of fetch promises, one for each page from 1 to 20.
    const pageFetchPromises = Array.from({length: maxPages}, (_, i) => {
      const page = i + 1;
      return fetchGitea<GiteaRepository[]>(endpoint, {limit, page});
    });

    // Wait for all page requests to complete in parallel.
    const pagesOfRepos = await Promise.all(pageFetchPromises);

    // Flatten the array of arrays into a single array of repositories.
    const allRepos = pagesOfRepos.flat();

    // Use a Map to easily get a list of unique repositories by their ID.
    const uniqueReposMap = new Map<number, GiteaRepository>();
    for (const repo of allRepos) {
      uniqueReposMap.set(repo.id, repo);
    }

    return Array.from(uniqueReposMap.values());
  } catch (error) {
    console.error(
      `Error fetching paginated ${type} repositories for ${name}:`,
      error
    );
    throw error; // Re-throw to let TanStack Query handle the error state
  }
}

/**
 * Fetches a zip file from a given URL and processes it like a local file upload.
 * This function now uses the native fetch API with manual state management.
 * @param zipUrl The URL of the zip file to download.
 */
export async function downloadFromRepo(
  zipUrl: string,
  projectName: () => string,
  isDownloading: () => boolean,
  setIsDownloading: (value: boolean) => void,
  setDownloadProgress: (value: number) => void
): Promise<File | null> {
  // Check if a project name is entered and if a download is not already in progress.
  if (isDownloading()) {
    console.log("Project name or download already in progress.");
    return null;
  }

  setIsDownloading(true);
  setDownloadProgress(0);

  try {
    console.log("Starting download for zip from:", zipUrl);
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const contentLength = response.headers.get("content-length");
    let receivedLength = 0;
    const chunks = [];
    let lastReportedProgress = 0;

    if (reader && contentLength) {
      const total = parseInt(contentLength, 10);
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        receivedLength += value.length;
        const progress = Math.round((receivedLength / total) * 100);
        // Report progress in 10% increments
        if (progress - lastReportedProgress >= 10) {
          console.log(`Download progress: ${progress}%`);
          lastReportedProgress = progress;
        }
        setDownloadProgress(progress);
      }
    } else {
      // Fallback for when content-length header is not available
      console.warn(
        "Content-length header not available, progress tracking may be inaccurate."
      );
      const blob = await response.blob();
      chunks.push(new Uint8Array(await blob.arrayBuffer()));
    }

    const blob = new Blob(chunks);
    console.log("Download complete. Processing file...");
    const zipFile = new File([blob], `${projectName()}.zip`, {
      type: "application/zip",
    });
    // Once the file is downloaded, proceed with project creation
    setDownloadProgress(100);
    return zipFile;
  } catch (error) {
    console.error("Error creating project from repository:", error);
    setDownloadProgress(0); // Reset progress bar on error
    return null;
  } finally {
    setIsDownloading(false);
  }
}
