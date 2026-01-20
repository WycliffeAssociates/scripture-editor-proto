# Importing Projects into Dovetail

## Objective
Enable users to import existing scripture projects into Dovetail through multiple sources: local directories, ZIP archives, and a Language API for remote repositories.

## Import Methods

### 1. Directory Importer
Users select a local folder containing USFM scripture files via a native file picker. The system validates the folder contains valid project metadata, copies the contents to the Dovetail projects directory, and indexes the project files in the database. **Status: Implemented and working.**

### 2. File (ZIP) Importer
Users select a ZIP archive containing a scripture project. The system extracts the archive to a temporary location, validates the contents, resolves naming conflicts, copies to the projects directory, and indexes files. **Status: Implemented and working.**

### 3. Language API Importer (REST)
Users search languages to find available scripture repositories and import them. Replaces the current Gitea-based `RepoDownload` implementation. This approach provides a simpler, language-focused search experience with a single fetch and client-side filtering.

## Language API Importer - Detailed Plan

### Problem Statement
The current Gitea-based remote import (`RepoDownload.tsx`) has limitations:
- Rate limiting from the public Gitea API
- Expensive two-step search (users → orgs → repos)
- API inefficiencies when searching across many repositories
- Hard-coded to `content.bibletranslationtools.org`

### Proposed Solution
Use a REST API that pre-syncs and indexes repository metadata, enabling simple language-based search with a single fetch and client-side filtering.

### API Details
- **Endpoint**: `https://api.bibleineverylanguage.org/api/rest/consolidated-repos`
- **Method**: GET
- **Authentication**: None (public)
- **Environment Variable**: `LANGUAGE_API_URL` (for endpoint configuration)

### Response Schema
```json
{
  "vw_consolidated_repos": [
    {
      "language_ietf": "abz",
      "language_name": "Abui",
      "repo_url": "https://content.bibletranslationtools.org/rbnswartz/merged-abz",
      "title": null,
      "language_english_name": "Abui",
      "repo_name": "merged-abz",
      "username": "rbnswartz"
    }
  ]
}
```

### User Flow
1. User types in search input for languages
2. On first keystroke → fetch entire list (show loading UI)
3. Filter list client-side by search term (no refetch)
4. Display formatted results in autocomplete
5. User selects repo → download button enables
6. On download click → construct ZIP URL (try `master`, fallback to `main`)
7. Import proceeds using existing `WacsRepoImporter` logic

### Search & Display Logic

**Search Fields** (case-insensitive):
- `language_ietf` (e.g., "abz")
- `language_name` (native name, e.g., "Abui")
- `language_english_name` (e.g., "Abui")

**Display Format**:
```
[language_name] ([language_english_name] IF different)
[title IF exists]
[username/repo_name IF title conflict OR no title]
```

**Examples**:
- `"Abui"` (same English name)
- `"Español (Spanish)"`
- `"Complete New Testament (rbnswartz/nt-project)"` (no title)
- `"Bible Translation (username1/project-v1)"` vs `"Bible Translation (username2/project-v2)"` (title conflict)

### Implementation Components

#### 1. REST API Client (`src/core/domain/project/import/LanguageApiImporter.ts`)
```typescript
import { object, string, nullish, array } from 'valibot';

// Valibot schema for response validation
const ConsolidatedRepoSchema = object({
  language_ietf: string(),
  language_name: string(),
  repo_url: string(),
  title: nullish(string()),
  language_english_name: string(),
  repo_name: string(),
  username: string(),
});

const ConsolidatedReposResponseSchema = object({
  vw_consolidated_repos: array(ConsolidatedRepoSchema),
});

export interface ConsolidatedRepo {
  language_ietf: string;
  language_name: string;
  repo_url: string;
  title: string | null;
  language_english_name: string;
  repo_name: string;
  username: string;
}

export async function fetchConsolidatedRepos(): Promise<ConsolidatedRepo[]> {
  const url = import.meta.env.VITE_LANGUAGE_API_URL ||
    "https://api.bibleineverylanguage.org/api/rest/consolidated-repos";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Language API error: ${response.status}`);
  }

  const data = await response.json();
  return ConsolidatedReposResponseSchema.parse(data).vw_consolidated_repos;
}

export function formatRepoDisplay(repo: ConsolidatedRepo, allRepos: ConsolidatedRepo[]): string {
  // 1. Language display: native (english if different)
  const langPart = repo.language_name === repo.language_english_name
    ? repo.language_name
    : `${repo.language_name} (${repo.language_english_name})`;

  // 2. Check for title conflicts
  const title = repo.title || langPart;
  const titleMatches = allRepos.filter(r => (r.title || r.language_name) === title);
  const needsDifferentiator = titleMatches.length > 1;

  // 3. Build display string
  const parts = [langPart];
  if (repo.title) parts.push(repo.title);
  if (needsDifferentiator || !repo.title) parts.push(`${repo.username}/${repo.repo_name}`);

  return parts.join(' - ');
}

export async function getZipUrl(repo: ConsolidatedRepo): Promise<string> {
  const branches = ['master', 'main'];

  for (const branch of branches) {
    const zipUrl = `${repo.repo_url}/archive/${branch}.zip`;
    try {
      const response = await fetch(zipUrl, { method: 'HEAD' });
      if (response.ok) return zipUrl;
    } catch {
      // Try next branch
    }
  }

  throw new Error(`Unable to find archive for ${repo.repo_url}`);
}
```

#### 2. UI Component (`LanguageApiImporter.tsx`)
**Location**: `src/app/ui/components/import/LanguageApiImporter.tsx`

**Flow**:
1. Label: "Search by language" (clear it's for language search)
2. User types → first keystroke triggers fetch (show loading spinner)
3. Once fetched → filter cached list client-side by search term
4. Display formatted results in autocomplete
5. User selects repo → download button enables
6. On click → call `getZipUrl()` then `WacsRepoImporter.import()`

**State Management**:
- `fetchedRepos: ConsolidatedRepo[] | null` (cached after first fetch)
- `isLoading: boolean`
- `selectedRepo: ConsolidatedRepo | null`
- `searchTerm: string` (debounced)

**Error Handling**:
- Fetch failure → show error message in UI
- Both branches fail → show "Archive not found" error
- No crash on any error

#### 3. Integration
- Replace `RepoDownload.tsx` in `ProjectCreator.tsx`
- Keep existing `AutocompleteInput` component
- Same callback signature: `onDownload(zipUrl: string)`

### Success Criteria
- Input label clearly indicates language search
- First search triggers fetch with loading indicator
- Subsequent searches filter cached list (no refetch)
- Search matches against all 3 language fields (ietf, name, english_name)
- Display follows formatting rules (with title conflict differentiation)
- Download button disabled until repo selected
- Tries `master` branch first, falls back to `main` if fails
- Error message shown on fetch or branch failure (no crash)
- **Test**: E2E test searching "english" → selecting a repo → downloading

### Implementation Order
1. Create REST API client with Valibot validation (`LanguageApiImporter.ts`)
2. Implement display formatter with title conflict detection
3. Implement `getZipUrl()` with master → main fallback
4. Create `LanguageApiImporter.tsx` UI component
5. Replace `RepoDownload.tsx` in `ProjectCreator.tsx`
6. Add E2E test for language search and download flow
7. Remove/deprecate Gitea API client (`giteaApi.ts`) and `RepoDownload.tsx`

## Open Questions
None (all clarifications addressed)

## Notes
- No sync job required (API index is maintained externally)
- No GraphQL types needed (REST endpoint)
- Valibot schema colocated with fetching function
- API client lives in `src/core/domain/project/import/` alongside other importers
