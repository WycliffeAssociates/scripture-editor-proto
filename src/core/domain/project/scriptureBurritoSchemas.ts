import * as v from "valibot";

/**
 * Reusable schema for localized text (for example `{ "en": "Genesis" }`).
 *
 * Burrito stores many labels in locale maps. The loaders only read a subset of
 * those fields, so these schemas intentionally validate only what the app uses.
 */
const LocalizedTextSchema = v.record(v.string(), v.string());

/** Schema for the checksum payload nested inside Burrito ingredients. */
const ChecksumSchema = v.object({
    md5: v.string(),
});

const SourceSchema = v.object({
    identifier: v.string(),
    language: v.optional(v.string()),
    version: v.optional(v.string()),
});

/**
 * Schema for Burrito ingredient metadata.
 *
 * The app does not need the full Burrito spec here; it only validates the
 * properties loaders and save flows actually consult.
 */
const IngredientSchema = v.object({
    checksum: ChecksumSchema,
    size: v.number(),
    mimeType: v.string(),
    scope: v.optional(v.record(v.string(), v.unknown())),
});

export type Ingredient = v.InferOutput<typeof IngredientSchema>;

/** Schema for the language entries the loaders inspect for name and direction. */
const LanguageSchema = v.object({
    tag: v.string(),
    name: v.record(v.string(), v.string()),
    scriptDirection: v.optional(v.picklist(["ltr", "rtl"])),
});
export type BurritoLanguage = v.InferOutput<typeof LanguageSchema>;

/** Schema for localized book-name metadata used for display labels. */
const LocalizedNameSchema = v.object({
    short: LocalizedTextSchema,
    long: v.optional(LocalizedTextSchema),
    abbr: v.optional(LocalizedTextSchema),
});

/**
 * Main schema for the subset of Burrito metadata the loaders and save flows use.
 *
 * Keeping this narrow lets the app accept real-world Burrito files that include
 * extra spec fields we do not care about while still failing fast on the pieces
 * we rely on for classification and persistence.
 */
const ScriptureBurritoMetadataSchema = v.object({
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

    source: v.optional(v.array(SourceSchema)),

    subject: v.optional(v.record(v.string(), v.string())),

    type: v.optional(
        v.object({
            flavorType: v.optional(
                v.object({
                    name: v.optional(v.string()),
                    flavor: v.optional(
                        v.object({
                            name: v.optional(v.string()),
                            projectType: v.optional(v.string()),
                        }),
                    ),
                }),
            ),
        }),
    ),

    localizedNames: v.optional(v.record(v.string(), LocalizedNameSchema)),
});

export type ScriptureBurritoMetadata = v.InferOutput<
    typeof ScriptureBurritoMetadataSchema
>;

/** Parse unknown JSON into validated Burrito metadata or throw. */
export function parseScriptureBurritoMetadata(raw: unknown) {
    return v.parse(ScriptureBurritoMetadataSchema, raw);
}

/**
 * Safe tuple-return variant used by loaders and indexing code that want to log
 * or skip invalid metadata without throwing through the whole open pipeline.
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
