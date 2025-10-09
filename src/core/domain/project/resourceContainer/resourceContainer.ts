import {parse} from "yaml";
import {getBookSlug} from "../../../core/data/bible/bible.ts";

type DublinCore = {
  conformsto: string;
  contributor: string[];
  creator: string;
  description: string;
  format: string;
  identifier: string;
  issued: string;
  language: string;
  modified: string;
  publisher: string;
  relation: string[];
  rights: string;
  subject: string;
  title: string;
  type: string;
  version: string;
  source: string[];
};
type Checking = {
  checking_entity: string[];
  checking_level: string;
};
type Language = {
  direction: string;
  identifier: string;
  title: string;
};
type Project = {
  title: string;
  versification: string;
  identifier: string;
  sortAsString: string;
  sort: number;
  path: string;
  categories: string[];
};
type Source = {
  identifier: string;
  language: string;
  version: string;
};
type ResourceContainer = {
  dublin_core: DublinCore;
  checking: Checking;
  projects: Project[];
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
    (project) => bookSlug.toLowerCase() === project.identifier.toLowerCase()
  );
  return {
    title: project?.title,
    identifier: project?.identifier,
    sort: project?.sort,
    path: filePath,
  };
}

export function sortBasedOnManifest(
  files: ReturnType<typeof getLocalizedBookNameFromManifest>[]
) {
  return files.sort((a, b) => (a?.sort || 0) - (b?.sort || 0));
}
