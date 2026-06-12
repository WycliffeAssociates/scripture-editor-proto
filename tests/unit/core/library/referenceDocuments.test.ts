import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ReferenceDocument,
  ReferenceDocumentId,
  ReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";
import {
  createReferenceDocument,
  createReferenceDocumentId,
  createReferenceDocumentReference,
} from "@/core/library/ReferenceDocuments.ts";

describe("reference document contracts", () => {
  it("normalizes ids and browse metadata for document listing flows", () => {
    const documentId = createReferenceDocumentId("  kt/faith.md  ");
    const documentRef = createReferenceDocumentReference({
      id: documentId,
      name: "  faith  ",
      browsePath: [" kt ", " faith ", ""],
    });

    expect(documentRef).toEqual({
      id: documentId,
      name: "faith",
      browsePath: ["kt", "faith"],
    });
    expectTypeOf(documentId).toEqualTypeOf<ReferenceDocumentId>();
    expectTypeOf(documentRef).toEqualTypeOf<ReferenceDocumentReference>();
  });

  it("creates full document bodies without widening the id type", () => {
    const document = createReferenceDocument({
      id: createReferenceDocumentId("luk.json"),
      name: "Luke",
      browsePath: ["LUK"],
      contents: "# Luke",
    });

    expect(document).toEqual({
      id: createReferenceDocumentId("luk.json"),
      name: "Luke",
      browsePath: ["LUK"],
      contents: "# Luke",
    });
    expectTypeOf(document).toEqualTypeOf<ReferenceDocument>();
  });
});
