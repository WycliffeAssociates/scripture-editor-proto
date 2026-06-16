import { parse } from "yaml";

/**
 * Resource Container metadata shapes and parser.
 *
 * Container readers use these types when the loader pipeline encounters an RC
 * manifest. The app-facing item type is decided later; this file is only about
 * understanding the container metadata itself.
 */
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
  versification?: string;
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

/**
 * Parse an RC manifest into its typed metadata shape.
 */
export function parseResourceContainer(yamlManifest: string) {
  return parse(yamlManifest) as Partial<ResourceContainer>;
}
