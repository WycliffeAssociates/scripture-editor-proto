import { describe, expect, it } from "vitest";
import {
  extractRowsFromSlice,
  groupFlatTokensByVerse,
  insertMarkerInsideRowText,
} from "@/app/domain/editor/utils/formModeEntries.ts";
import {
  tokenMarker as marker,
  tokenNumberRange as numberRange,
  tokenText as text,
  tokenTexts,
} from "../../../../helpers/usfmTokenBuilders.ts";

describe("formModeEntries", () => {
  it("groups flat chapter tokens into prelude and verse slices", () => {
    const flat = [
      marker("c", "GEN 1"),
      numberRange("1", "GEN 1"),
      marker("s1", "GEN 1"),
      text("Creation", "GEN 1"),
      marker("v", "GEN 1:1"),
      numberRange("1"),
      text(" In the beginning"),
      marker("v", "GEN 1:2"),
      numberRange("2", "GEN 1:2"),
      text(" And the earth", "GEN 1:2"),
    ];

    const grouped = groupFlatTokensByVerse(flat);

    expect(grouped.prelude).toHaveLength(4);
    expect(grouped.verses).toHaveLength(2);
    expect(tokenTexts(grouped.verses[0] ?? [])).toEqual(["\\v ", "1", " In the beginning"]);
  });

  it("splits a form field when inserting a marker at the textarea caret", () => {
    const slice = [marker("v"), numberRange("1"), marker("p"), text(" Alpha beta gamma")];
    const paragraphRow = extractRowsFromSlice(slice, "row").find(
      (row) => row.kind === "marker" && row.marker === "p",
    );
    expect(paragraphRow).toBeDefined();

    const next = insertMarkerInsideRowText(
      slice,
      paragraphRow!,
      "Alpha beta".length,
      "q2",
      "GEN 1:1",
    );

    expect(tokenTexts(next)).toEqual(["\\v ", "1", "\\p ", " Alpha beta", "\\q2 ", "\n", " gamma"]);
  });
});
