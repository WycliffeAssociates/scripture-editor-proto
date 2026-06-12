/**
 * Low-level storage metadata discovered while importing or loading a managed
 * item from disk.
 *
 * Container format exists so import/load code can account for how metadata is
 * stored. UI should not branch on this.
 */
export type ContainerFormat = "resource-container" | "scripture-burrito";

/**
 * Source metadata for a sync-capable item.
 *
 * This is an affordance layered onto a typed noun. It is not the noun itself.
 */
export type RemoteSyncCapabilitySource = {
  kind: "git" | "url" | "unknown";
  identifier: string;
  ref?: string;
  shallowClone?: boolean;
};

/**
 * Capability for items that can fetch and apply updates from a remote source.
 */
export type RemoteSyncCapability = {
  kind: "remoteSync";
  source: RemoteSyncCapabilitySource;
  applyUpdate(): Promise<void>;
};

/**
 * Capability for items that can resolve scripture anchors in app flows.
 */
export type AnchorNavigationCapability = {
  kind: "anchorNavigation";
};

/**
 * Behavior affordances layered onto a typed noun.
 *
 * Capabilities answer "what may the app do with this item?" while the noun's
 * `type` answers "what kind of thing is this and what verbs does it expose?".
 */
export type LibraryItemCapabilities = {
  editableWith?: "usfmScripture";
  remoteSync?: RemoteSyncCapability;
  anchorNavigation?: AnchorNavigationCapability;
};
