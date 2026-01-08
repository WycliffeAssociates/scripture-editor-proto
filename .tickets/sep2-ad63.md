---
id: sep2-ad63
status: closed
deps: [sep2-1a93]
links: []
created: 2026-01-07T03:10:30Z
type: feature
priority: 2
assignee: Will Kelly
---
# Replace RepoDownload.tsx in ProjectCreator with LanguageApiImporter

Update src/app/ui/components/project/ProjectCreator.tsx to replace RepoDownload component with LanguageApiImporter. Ensure callback signature matches: onDownload(zipUrl: string). Wire up download flow: getZipUrl() → WacsRepoImporter.import().

