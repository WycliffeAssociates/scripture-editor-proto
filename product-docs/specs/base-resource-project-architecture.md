# BaseResource / Project Architecture

Status: **Superseded**
Date: 2026-03-23
Superseded by: `product-docs/specs/typed-library-item-architecture.md` (2026-03-25)

> **Historical note:** This ADR established the `BaseResource` / `Project` two-layer model. The terminology and contract shapes have since been replaced by the `LibraryItem` typed union model. See the superseding ADR for current guidance.

## Context

Sefer currently needs to support more than editable scripture workspaces. The app must still handle scripture projects as the primary writable editing surface, but it also needs a generic read-only seam for other local resource types such as Translation Notes and Translation Words.

The core mistake to avoid is making every local resource look like a scripture project. `Project` should stay scripture-specific and writable. `BaseResource` should be the generic read-only boundary that other content types can fit into without being forced into book/chapter editing semantics.

## Decision

We use a two-layer model:

- `BaseResource` is the generic read-only contract for addressable local content.
- `Project` is the scripture-specific writable workspace built on top of that model.

`BaseResource` is intentionally not Bible-shaped. It represents a resource by descriptor and exposes document-oriented access:

- stable resource id
- display name
- resource kind
- container format
- language
- read-only state
- document listing
- document reads by stable opaque document id

`Project` remains the place for scripture-specific editing behavior:

- USFM editing
- save and revert
- chapter navigation
- diff/history/versioning
- book-oriented workspace state

Specialization happens through optional capabilities instead of widening the base contract:

- `ScriptureAnchorAddressable` for resources that can resolve a scripture reference to zero or more documents
- `RemoteSyncCapable` for resources that carry remote/source metadata and may later support update checks or apply operations

The base model must not require any of these capabilities. A valid `BaseResource` may be read-only, grouped, and completely non-scripture.

## Examples

### Scripture project

An editable USFM project such as an `en_ulb` workspace is a `Project`.

- container type: Scripture Burrito or equivalent scripture workspace container
- resource kind: `scripture-usfm`
- writable: yes
- anchorable: usually yes
- remote sync capable: optional, but not part of the edit contract

This is the only shape that should flow through the main scripture editing workspace.

### Translation Notes

An `en_tn_condensed` resource is a `BaseResource`, not a `Project`.

- container type: Resource Container or directory-backed resource
- resource kind: `translation-notes`
- writable: no
- anchorable: yes, if the content can resolve scripture references
- remote sync capable: optional seam only

TN is the first shipped non-scripture renderer. The reference panel can read it, resolve anchors, and display notes, but the main project workspace must not treat it as editable scripture.

### Translation Words / grouped markdown

A Translation Words resource such as:

- `bible/kt/*.md`
- `bible/names/*.md`
- `bible/other/*.md`

is also a `BaseResource`.

- container type: Resource Container or directory-backed resource
- resource kind: `translation-words` or `generic-markdown-collection`
- writable: no
- anchorable: not required
- remote sync capable: optional seam only

This example is why `BaseResource` must be document-oriented rather than chapter-oriented. A grouped markdown collection needs browse paths and stable document ids, but it does not need Bible-only editing concepts.

## First Vertical Slice

The first implementation slice should establish a narrow but complete seam:

1. Load container-backed local resources into `BaseResource`.
2. Classify resources so scripture projects can be promoted to `Project`, while TN/TW-style content remains read-only.
3. Keep the main project workspace scripture-only.
4. Let the reference panel consume read-only resources through capability-based resolution.
5. Render TN as the first non-scripture reference resource.

That gives us a shared resource seam without dissolving scripture editing into a generic content viewer.

## Non-goals For V1

The first release of this model does not include:

- a TW renderer
- a reference-resource update UI
- a multi-resource stacked reference panel
- generic writable resources outside scripture projects
- remote update application for read-only resources
- making `Project` into a catch-all workspace type

Remote sync support is model-only in v1. The architecture may reserve shallow-clone or source metadata hints, but it should not promise a complete update workflow yet.

## Consequences

This split makes the architecture simpler to extend:

- new read-only resource types can fit into `BaseResource` without pretending to be scripture projects
- scripture-specific editing behavior stays isolated
- the reference panel can grow independently of the main editor
- remote-backed resources can be modeled now without committing to update UX or write paths

The cost is an explicit adapter layer between generic resources and scripture workspaces. That is intentional. It keeps the base contract small and prevents the app from becoming mushy as more resource kinds are added.

## Migration Stance

The existing scripture editing flows remain the source of truth for writable behavior. We should migrate callers toward `BaseResource` through adapters and promotion steps instead of broadening scripture-specific APIs in place.

Practical rule:

- if a feature needs book/chapter editing, it belongs in `Project`
- if a feature only needs to read or browse content, it should start from `BaseResource`
- if a feature needs scripture lookup but not editing, add a capability instead of widening the base interface

## Code Pointers

These files were removed as part of the migration to the `LibraryItem` typed union model. The superseding ADR (`typed-library-item-architecture.md`) has current code pointers.
