import * as onion from "usfm-onion-web";
import { describe, expect, it } from "vitest";
import {
    ALL_USFM_MARKERS,
    VALID_NOTE_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/domain/usfm/onionMarkers.ts";

type OnionMarkerModule = typeof import("usfm-onion-web");

const wasm: OnionMarkerModule = onion;

function diff(left: ReadonlySet<string>, right: ReadonlySet<string>) {
    return [...left].filter((value) => !right.has(value)).sort();
}

const knownLocalOnlyMarkers = [
    "lim4",
    "liv1",
    "liv2",
    "liv3",
    "liv4",
    "liv5",
    "qt1-e",
    "qt1-s",
    "qt2-e",
    "qt2-s",
    "qt3-e",
    "qt3-s",
    "qt4-e",
    "qt4-s",
    "qt5-e",
    "qt5-s",
    "s5",
    "sd4",
    "t-e",
    "t-s",
    "ts",
    "ts-e",
    "ts-s",
];

const knownLocalOnlyParagraphMarkers = ["lim4", "s5", "sd4"];
const knownUpstreamOnlyMarkers: string[] = [];
const knownUpstreamOnlyParagraphMarkers: string[] = [];

describe("local marker catalogs", () => {
    it("documents the current local-vs-upstream all-markers delta", () => {
        const catalog = wasm.markerCatalog();
        const upstream = new Set(catalog.all().map((info) => info.marker));
        const localOnly = diff(ALL_USFM_MARKERS, upstream);
        const upstreamOnly = diff(upstream, ALL_USFM_MARKERS);

        expect(localOnly).toEqual(knownLocalOnlyMarkers);
        expect(upstreamOnly).toEqual(knownUpstreamOnlyMarkers);
    });

    it("documents the current paragraph and note subset delta", () => {
        const upstreamParagraphs = new Set(
            wasm
                .markerCatalog()
                .all()
                .filter((info) => info.category === "paragraph")
                .map((info) => info.marker),
        );
        const upstreamNotes = new Set(
            wasm
                .markerCatalog()
                .all()
                .filter((info) => info.category === "noteContainer")
                .map((info) => info.marker),
        );

        expect(diff(VALID_PARA_MARKERS, upstreamParagraphs)).toEqual(
            knownLocalOnlyParagraphMarkers,
        );
        expect(diff(upstreamParagraphs, VALID_PARA_MARKERS)).toEqual(
            knownUpstreamOnlyParagraphMarkers,
        );
        expect(diff(VALID_NOTE_MARKERS, upstreamNotes)).toEqual([]);
        expect(diff(upstreamNotes, VALID_NOTE_MARKERS)).toEqual([]);
    });
});
