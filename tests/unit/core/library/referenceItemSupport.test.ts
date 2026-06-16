import { describe, expect, expectTypeOf, it } from "vitest";

import { createReferenceDocumentId } from "@/core/library/ReferenceDocuments.ts";
import type {
  RemoteSyncCapable,
  ScriptureAnchorAddressable,
} from "@/core/library/ReferenceItemSupport.ts";
import {
  isRemoteSyncCapable,
  isScriptureAnchorAddressable,
  isReferenceTypeAnchorable,
} from "@/core/library/ReferenceItemSupport.ts";

describe("reference item support", () => {
  it("keeps optional capabilities absent until a loaded item exposes them", () => {
    const plainReferenceItem = {
      descriptor: { type: "translationWords" as const },
    };

    expectTypeOf(
      plainReferenceItem,
    ).not.toMatchTypeOf<ScriptureAnchorAddressable>();
    expectTypeOf(plainReferenceItem).not.toMatchTypeOf<RemoteSyncCapable>();
    expect(isScriptureAnchorAddressable(plainReferenceItem)).toBe(false);
    expect(isRemoteSyncCapable(plainReferenceItem)).toBe(false);
  });

  it("detects scripture-anchor and remote-sync affordances when present", async () => {
    const documentRef = {
      id: createReferenceDocumentId("mat/01/01.md"),
      name: "Matthew 1:1",
    };

    const anchoredItem: ScriptureAnchorAddressable = {
      resolveScriptureAnchor: async () => [documentRef],
    };

    const syncCapableItem: RemoteSyncCapable = {
      remoteSource: {
        kind: "git",
        identifier: "https://example.com/repo.git",
        ref: "main",
        shallowClone: true,
      },
      checkForUpdates: async () => ({
        hasUpdates: false,
        remoteRevision: "abc123",
      }),
      applyUpdates: async () => {},
    };

    expect(isScriptureAnchorAddressable(anchoredItem)).toBe(true);
    expect(isRemoteSyncCapable(syncCapableItem)).toBe(true);
    expect(isReferenceTypeAnchorable("usfmScripture")).toBe(true);
    expect(isReferenceTypeAnchorable("translationNotes")).toBe(true);
    expect(isReferenceTypeAnchorable("translationWords")).toBe(false);
    await expect(
      anchoredItem.resolveScriptureAnchor({
        bookCode: "MAT",
        chapter: 1,
        verse: 1,
      }),
    ).resolves.toEqual([documentRef]);
    await expect(syncCapableItem.checkForUpdates()).resolves.toEqual({
      hasUpdates: false,
      remoteRevision: "abc123",
    });
    await expect(syncCapableItem.applyUpdates()).resolves.toBeUndefined();
  });
});
