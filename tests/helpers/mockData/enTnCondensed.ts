import type { FileSystem } from "@/core/persistence/FileSystem.ts";

export const EN_TN_CONDENSED_FILES = {
  "manifest.yaml": [
    "dublin_core:",
    "  identifier: en_tn_condensed",
    "  title: English Translation Notes Condensed",
    "  subject: Translation Notes",
    "  format: text/markdown",
    "  language:",
    "    identifier: en",
    "    title: English",
    "    direction: ltr",
    "projects:",
    "  - identifier: dan",
    "    title: Daniel",
    "    path: dan/12/03.md",
    "    sort: 27",
    "    categories: []",
    "  - identifier: luk",
    "    title: Luke",
    "    path: luk/22/71.md",
    "    sort: 43",
    "    categories: []",
    "  - identifier: col",
    "    title: Colossians",
    "    path: col/01/27.md",
    "    sort: 51",
    "    categories: []",
  ].join("\n"),
  "col/01/27.md":
    '# the riches of the glory of this mystery\n\n"how glorious and wonderful this hidden truth is"\n\n# Christ in you, the hope of glory\n\n"Christ is in you, and this is why you can confidently expect to share in God\'s glory"\n',
  "luk/22/71.md":
    '# Why do we still need a witness?\n\n"We have no further need for witnesses!"\n\n# have heard from his own mouth\n\n"have heard him say it"\n',
  "dan/12/03.md": '# Those who are wise\n\n"Those who have insight"\n',
} as const;

export async function seedEnTnCondensedFixture(
  fileSystem: FileSystem,
  projectRootPath: string,
): Promise<void> {
  for (const [relativePath, contents] of Object.entries(
    EN_TN_CONDENSED_FILES,
  )) {
    await fileSystem.writeText(`${projectRootPath}/${relativePath}`, contents);
  }
}
