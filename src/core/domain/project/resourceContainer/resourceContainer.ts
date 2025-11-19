import { parse } from "yaml";
import { getBookSlug } from "@/core/data/bible/bible.ts";

export type ResourceContainerDublinCore = {
  conformsto: string;
  contributor: string[];
  creator: string;
  description: string;
  format: string;
  identifier: string;
  issued: string;
  language: ResourceContainerLanguage;
  modified: string;
  publisher: string;
  relation: string[];
  rights: string;
  subject: string;
  title: string;
  type: string;
  version: string;
  source: ResourceContainerSource[];
};

export type Checking = {
  checking_entity: string[];
  checking_level: string;
};
export type ResourceContainerLanguage = {
  direction: string;
  identifier: string;
  title: string;
};
export type ResourceContainerProject = {
  title: string;
  versification: string;
  identifier: string;
  sort: number;
  path: string;
  categories: string[];
};
export type ResourceContainerSource = {
  identifier: string;
  language: string;
  version: string;
};

export type ResourceContainer = {
  dublin_core: ResourceContainerDublinCore;
  checking: Checking;
  projects: ResourceContainerProject[];
};

export function parseResourceContainer(yamlManifest: string) {
  return parse(yamlManifest) as Partial<ResourceContainer>;
}

export function getLocalizedBookNameFromManifest({
  bookName,
  filePath,
  resourceContainer,
}: {
  bookName: string;
  filePath: string;
  resourceContainer: Partial<ResourceContainer>;
}) {
  const bookSlug = getBookSlug(bookName);
  const project = resourceContainer.projects?.find(
    (project) => bookSlug.toLowerCase() === project.identifier.toLowerCase(),
  );
  return {
    title: project?.title,
    identifier: project?.identifier,
    sort: project?.sort,
    path: filePath,
  };
}

export function sortBasedOnManifest(
  files: ReturnType<typeof getLocalizedBookNameFromManifest>[],
) {
  return files.sort((a, b) => (a?.sort || 0) - (b?.sort || 0));
}
