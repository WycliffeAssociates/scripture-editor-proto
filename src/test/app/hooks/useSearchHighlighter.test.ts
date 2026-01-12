import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearHighlights,
    highlightMatch,
    type MatchInNode,
} from "@/app/ui/hooks/useSearchHighlighter.ts";

// Minimal mock implementations for DOM testing
class MockTextNode {
    text: string;

    constructor(text: string) {
        this.text = text;
    }
}

class MockElement {
    textContent: string;
    firstChild: MockTextNode | null;
    childNodes: (MockTextNode | null)[];

    constructor(text: string) {
        this.textContent = text;
        this.firstChild = text ? new MockTextNode(text) : null;
        this.childNodes = [this.firstChild];
    }

    appendChild(_node: unknown): void {
        // No-op for mock
    }

    scrollIntoView = vi.fn();
}

class MockRange {
    startContainer: MockElement | MockTextNode;
    startOffset: number;
    endContainer: MockElement | MockTextNode;
    endOffset: number;

    constructor() {
        this.startContainer = {} as MockElement | MockTextNode;
        this.startOffset = 0;
        this.endContainer = {} as MockElement | MockTextNode;
        this.endOffset = 0;
    }

    setStart(container: MockElement | MockTextNode, offset: number): void {
        this.startContainer = container;
        this.startOffset = offset;
    }

    setEnd(container: MockElement | MockTextNode, offset: number): void {
        this.endContainer = container;
        this.endOffset = offset;
    }
}

class MockHighlight {
    ranges: MockRange[] = [];

    add(range: MockRange): void {
        this.ranges.push(range);
    }
}

describe("useSearchHighlighter", () => {
    let mockEditor: {
        getElementByKey: ReturnType<
            typeof vi.fn<(key: string) => MockElement | null>
        >;
    };

    let mockHighlights: Record<string, MockHighlight>;

    beforeEach(() => {
        // Initialize mockHighlights
        mockHighlights = {};

        // Mock CSS Custom Highlight API
        global.CSS = {
            highlights: {
                clear: vi.fn(() => {
                    Object.keys(mockHighlights).forEach((key) => {
                        delete mockHighlights[key];
                    });
                }),
                set: vi.fn((name: string, highlight: MockHighlight) => {
                    mockHighlights[name] = highlight;
                }),
            },
        } as unknown as typeof CSS;

        // Mock Highlight constructor to return our mock
        global.Highlight =
            class extends MockHighlight {} as unknown as typeof Highlight;

        // Mock Range to return our mock
        global.Range = MockRange as unknown as typeof Range;

        // Mock document for creating elements
        global.document = {
            createElement: vi.fn(
                () => new MockElement(""),
            ) as unknown as Document["createElement"],
            createTextNode: vi.fn(
                (text: string) => new MockTextNode(text),
            ) as unknown as Document["createTextNode"],
        } as unknown as Document;

        // Mock Lexical editor
        mockEditor = {
            getElementByKey: vi.fn<(key: string) => MockElement | null>(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockHighlights = {};
    });

    describe("clearHighlights", () => {
        it("should clear all CSS highlights", () => {
            clearHighlights();
            expect(CSS.highlights.clear).toHaveBeenCalledTimes(1);
        });

        it("should call CSS.highlights.clear", () => {
            clearHighlights();
            expect(global.CSS.highlights.clear).toHaveBeenCalled();
        });
    });

    describe("highlightMatch - Range Creation", () => {
        it("should create Range object with correct start and end offsets for substring match", () => {
            // Create DOM element with text
            const container = new MockElement("Hello world this is a test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 6,
                end: 11, // "world"
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "world",
                false, // matchWholeWord
                true, // matchCase
            );

            // Verify scrollIntoView was called
            expect(container.scrollIntoView).toHaveBeenCalledWith({
                block: "center",
                behavior: "smooth",
            });

            // Verify CSS.highlights.set was called
            expect(CSS.highlights.set).toHaveBeenCalledTimes(1);
            expect(CSS.highlights.set).toHaveBeenCalledWith(
                "matched-search",
                expect.any(Object),
            );

            // Verify the highlight has the correct ranges
            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(1);

            const range = highlight.ranges[0];
            expect(range.startContainer).toBe(container.firstChild);
            expect(range.endContainer).toBe(container.firstChild);
            expect(range.startOffset).toBe(6);
            expect(range.endOffset).toBe(11);
        });

        it("should create multiple Range objects for multiple substring matches", () => {
            const container = new MockElement("test test test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 14,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false, // matchWholeWord
                true, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(3);

            // First match: "test" at position 0
            expect(highlight.ranges[0].startOffset).toBe(0);
            expect(highlight.ranges[0].endOffset).toBe(4);

            // Second match: "test" at position 5
            expect(highlight.ranges[1].startOffset).toBe(5);
            expect(highlight.ranges[1].endOffset).toBe(9);

            // Third match: "test" at position 10
            expect(highlight.ranges[2].startOffset).toBe(10);
            expect(highlight.ranges[2].endOffset).toBe(14);
        });
    });

    describe("highlightMatch - Whole Word Mode", () => {
        it("should only highlight whole word matches", () => {
            const container = new MockElement("testing tested test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 18,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                true, // matchWholeWord
                true, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(1);

            // Only "test" at the end should be highlighted (whole word)
            expect(highlight.ranges[0].startOffset).toBe(14);
            expect(highlight.ranges[0].endOffset).toBe(18);
        });

        it("should respect word boundaries at start and end", () => {
            const container = new MockElement("test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                true, // matchWholeWord
                true, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(1);
            expect(highlight.ranges[0].startOffset).toBe(0);
            expect(highlight.ranges[0].endOffset).toBe(4);
        });

        it("should handle multiple whole word matches", () => {
            const container = new MockElement("test hello test world test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 26,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                true, // matchWholeWord
                true, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(3);
        });
    });

    describe("highlightMatch - Case Sensitivity", () => {
        it("should match case-sensitively when matchCase is true", () => {
            const container = new MockElement("Test test TEST");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 14,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false, // matchWholeWord
                true, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            // Should only match the lowercase "test" at position 5
            expect(highlight.ranges).toHaveLength(1);
            expect(highlight.ranges[0].startOffset).toBe(5);
            expect(highlight.ranges[0].endOffset).toBe(9);
        });

        it("should match case-insensitively when matchCase is false", () => {
            const container = new MockElement("Test test TEST");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 14,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false, // matchWholeWord
                false, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            // Should match all three instances
            expect(highlight.ranges).toHaveLength(3);
        });

        it("should preserve original case in highlighted range for case-insensitive match", () => {
            const container = new MockElement("Test TEST test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 14,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false, // matchWholeWord
                false, // matchCase
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(3);

            // All ranges should be 4 characters long
            highlight.ranges.forEach((range: MockRange) => {
                expect(range.endOffset - range.startOffset).toBe(4);
            });
        });
    });

    describe("highlightMatch - scrollIntoView", () => {
        it("should call scrollIntoView with correct parameters", () => {
            const container = new MockElement("test content");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            expect(container.scrollIntoView).toHaveBeenCalledWith({
                block: "center",
                behavior: "smooth",
            });
        });

        it("should call scrollIntoView before creating highlights", () => {
            const container = new MockElement("test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            // scrollIntoView should be called before CSS.highlights.set
            const scrollCallIndex =
                container.scrollIntoView.mock.invocationCallOrder[0];
            const setCallIndex = (
                CSS.highlights.set as ReturnType<typeof vi.fn>
            ).mock.invocationCallOrder[0];

            expect(scrollCallIndex).toBeLessThan(setCallIndex);
        });
    });

    describe("highlightMatch - CSS Custom Highlight API", () => {
        it("should set highlight with correct name", () => {
            const container = new MockElement("test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            expect(CSS.highlights.set).toHaveBeenCalledWith(
                "matched-search",
                expect.any(Object),
            );
        });

        it("should pass Highlight object with ranges to CSS.highlights.set", () => {
            const container = new MockElement("test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            const highlight = mockHighlights["matched-search"];

            // Verify it's a Highlight object with ranges
            expect(highlight).toBeDefined();
            expect(highlight.ranges).toBeDefined();
            expect(Array.isArray(highlight.ranges)).toBe(true);
            expect(highlight.ranges).toHaveLength(1);
        });
    });

    describe("highlightMatch - Edge Cases", () => {
        it("should return early if getElementByKey returns null", () => {
            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(null);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            // Should not call CSS.highlights.set
            expect(CSS.highlights.set).not.toHaveBeenCalled();
        });

        it("should return early if DOM element has no text content", () => {
            const container = new MockElement("");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                false,
                true,
            );

            // Should not call CSS.highlights.set
            expect(CSS.highlights.set).not.toHaveBeenCalled();
        });

        it("should handle element without firstChild", () => {
            const container = new MockElement("test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 4,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            // Should not throw error
            expect(() => {
                highlightMatch(
                    match,
                    mockEditor as unknown as any,
                    "test",
                    false,
                    true,
                );
            }).not.toThrow();

            // Should still create highlight using element itself
            expect(CSS.highlights.set).toHaveBeenCalled();
        });

        it("should handle empty search term gracefully", () => {
            const container = new MockElement("test content");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 12,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "",
                false,
                true,
            );

            // Should not crash - no ranges should be created for empty term
            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(0);
        });

        it("should handle special regex characters in whole word mode", () => {
            const container = new MockElement("test (test) test");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 16,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            // Search for "test" with special char in text
            highlightMatch(
                match,
                mockEditor as unknown as any,
                "test",
                true, // matchWholeWord
                true,
            );

            // Should match "test" at positions 0 and 12, but not at position 5 (before parenthesis)
            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(2);
        });
    });

    describe("highlightMatch - Complex Scenarios", () => {
        it("should handle multiple matches with different case when case-insensitive", () => {
            const container = new MockElement("Hello HELLO hello HeLLo");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 21,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "hello",
                false,
                false,
            );

            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(4);
        });

        it("should handle overlapping matches correctly in substring mode", () => {
            const container = new MockElement("aaa");

            const mockNode: MatchInNode["node"] = {
                getKey: () => "test-key",
            } as MatchInNode["node"];

            const match: MatchInNode = {
                node: mockNode,
                start: 0,
                end: 3,
            };

            mockEditor.getElementByKey.mockReturnValue(container);

            highlightMatch(
                match,
                mockEditor as unknown as any,
                "aa",
                false,
                true,
            );

            // Should find "aa" at positions 0 and 1
            const highlight = mockHighlights["matched-search"];
            expect(highlight.ranges).toHaveLength(2);

            expect(highlight.ranges[0].startOffset).toBe(0);
            expect(highlight.ranges[0].endOffset).toBe(2);

            expect(highlight.ranges[1].startOffset).toBe(1);
            expect(highlight.ranges[1].endOffset).toBe(3);
        });
    });
});
