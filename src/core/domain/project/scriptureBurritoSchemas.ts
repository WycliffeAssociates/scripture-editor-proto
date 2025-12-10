import * as v from "valibot";

/**
 * Reusable schema for localized text (e.g. { "en": "Genesis" })
 * Used extensively in Burrito metadata.
 */
export const LocalizedTextSchema = v.record(v.string(), v.string());

/**
 * Schema for ingredient checksum validation
 */
export const ChecksumSchema = v.object({
    md5: v.string(),
});

/**
 * Schema for burrito ingredient validation
 * Only validates properties we actually access
 */
export const IngredientSchema = v.object({
    checksum: ChecksumSchema,
    size: v.number(),
    mimeType: v.string(),
    scope: v.optional(v.record(v.string(), v.unknown())),
});

export type Ingredient = v.InferOutput<typeof IngredientSchema>;

/**
 * Schema for language definitions in burrito metadata
 */
export const LanguageSchema = v.object({
    tag: v.string(),
    name: v.record(v.string(), v.string()),
    scriptDirection: v.optional(v.picklist(["ltr", "rtl"])),
});

/**
 * Schema for language definitions in burrito metadata
 */
export const LanguageDefinitionSchema = v.object({
    tag: v.string(),
    name: v.record(v.string(), v.string()),
    direction: v.optional(v.picklist(["ltr", "rtl"])),
});

/**
 * Schema for languages object in burrito metadata
 * Simplified to only validate what we actually use
 */
export const LanguagesSchema = v.object({
    default: v.object({ tag: v.string() }),
});

/**
 * Schema for localized book names
 */
export const LocalizedNameSchema = v.object({
    short: LocalizedTextSchema,
    long: v.optional(LocalizedTextSchema),
    abbr: v.optional(LocalizedTextSchema),
});

/**
 * Main schema for Scripture Burrito metadata validation
 * Only validates properties we actually access, keeping everything optional for flexibility
 */
export const ScriptureBurritoMetadataSchema = v.object({
    meta: v.object({
        version: v.string(),
        defaultLocale: v.optional(v.string()),
        dateCreated: v.optional(v.string()),
    }),

    identification: v.optional(
        v.object({
            name: LocalizedTextSchema,
            description: v.optional(LocalizedTextSchema),
            abbreviation: v.optional(LocalizedTextSchema),
        }),
    ),
    languages: v.optional(v.array(LanguageSchema)),

    ingredients: v.record(v.string(), IngredientSchema),

    localizedNames: v.optional(v.record(v.string(), LocalizedNameSchema)),
});

export type ScriptureBurritoMetadata = v.InferOutput<
    typeof ScriptureBurritoMetadataSchema
>;

/**
 * Parse and validate Scripture Burrito metadata from unknown input
 * Throws if validation fails
 */
export function parseScriptureBurritoMetadata(raw: unknown) {
    return v.parse(ScriptureBurritoMetadataSchema, raw);
}

/**
 * Safe validation function that returns tuple pattern
 * Following established patterns from ProjectRepository.ts
 */
export function tryParseScriptureBurritoMetadata(
    raw: unknown,
): [
    ReturnType<typeof parseScriptureBurritoMetadata> | undefined,
    Error | undefined,
] {
    try {
        const parsed = parseScriptureBurritoMetadata(raw);
        return [parsed, undefined];
    } catch (err) {
        return [undefined, err instanceof Error ? err : new Error(String(err))];
    }
}
