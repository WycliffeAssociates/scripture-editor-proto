// If it can be helped, I'd rather not use this file generally speaking, but there's reasons where you don't want to pull web imports into Rusts or vice versa. And so these are things that might be agnostic to platform, but they're still kind of domain type logic for the UI. They're not so much domain as they are UI logic that's shared.

export function shouldKeepLintIssue(issue: {
    code: string;
    marker?: string | null;
}) {
    return issue.code !== "unknown-marker" || issue.marker !== "s5";
}
