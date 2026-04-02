# Sync Collaboration Notes

These are rough future notes, not a committed product spec.

## Core direction

- Keep Dovetail local-first.
- Do not introduce CRDT-style shared live editing as the default collaboration model.
- Prefer synchronous awareness plus deliberate acceptance of other translators' work.
- Reuse the existing diff/apply mental model instead of inventing a second merge model.

## Product shape

- A user can join a collaboration room backed by a websocket server.
- Rooms are small team spaces, likely around 3-5 translators/checkers.
- Each participant keeps their own local editor and local working state.
- The editor surface is not shared live by default.
- The collaboration UI shows where team members differ and lets users review/apply those changes into their own local state.

## Joining a room

- On join, the client sends its current workspace baseline to the websocket server.
- Likely transport shape:
  - current `mutWorkingFilesRef` normalized to USFM
  - compressed over the wire
- Possible optimization:
  - client sends chapter/content hashes first
  - server asks for full chapter/book content only when it does not already have that snapshot

## Server responsibilities

- The websocket server should own collaboration comparison state.
- It should store the latest submitted chapter snapshot for each participant.
- It should compute and maintain chapter-scoped diff state for the room.
- It should rebroadcast only the relevant chapter-level divergence updates back to clients.
- It should be okay if server-side diffing is a little heavier, since the server can be the beefier machine.

## Update model

- Initial join may send a full project/book/chapter baseline.
- Ongoing updates should send only changed chapters.
- A normal typing session usually updates one chapter.
- A larger action such as global find/replace may update many chapters.
- Websocket sends should be debounced, likely around 100-250ms, so updates feel intentional rather than keystroke-noisy.

## Review model

- Diff transport unit:
  - chapter
- Review/apply unit:
  - SID / verse / diff block
- Server can notify clients:
  - there is divergence in `GEN 1:4`
  - who differs
  - the chapter-level diff summary
- Clients should not need to pairwise diff every participant locally.

## UI ideas

- Collaboration panel or sync panel with chapter-level divergence badges.
- Selecting a chapter shows:
  - my version
  - one selected teammate's version or proposal
  - summary of other differing participants
- Threads can attach to:
  - a SID
  - or a diff block unique id
- `@mentions` can target a SID and jump the reader to that location when clicked.
- Notifications can say who changed a verse/chapter.

## Acceptance behavior

- User stays in control of their own local workspace.
- Incoming collaborator changes are proposals, not forced edits.
- User can apply one verse, one block, one chapter, or maybe accept a trusted collaborator in batches.
- Any future `auto-accept` mode should still be batched and review-shaped, not keystroke-synchronous.

## Why this direction

- Avoid multi-cursor confusion for translators who are not used to shared-document editing.
- Avoid CRDT/OT complexity and surprise text movement.
- Preserve the latest-vs-latest review model that already fits Dovetail.
- Let people collaborate in real time without turning the editor itself into a contested shared document.

## Stretch idea: "lend editor"

This is explicitly a separate future concept, not part of the main sync collaboration model.

- A participant could temporarily "lend" their editor to another collaborator.
- If both sides agree, their files are synchronized 1:1 for the duration of the session.
- The lender is effectively locked out while the borrower edits.
- Borrower edits are mirrored into the lender's local workspace.
- This could help with guided support/debugging/checking sessions later.

## Likely implementation bias

- Server-backed websocket room.
- Chapter-scoped canonical comparison state on the server.
- Existing diff/apply nouns reused on the client.
- No shared live editor surface in v1 sync collaboration.
