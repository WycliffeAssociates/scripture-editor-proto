import { Checkbox } from "@/app/ui/components/primitives/Checkbox/Checkbox.tsx";
import { TextInput } from "@/app/ui/components/primitives/Input/Input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/ui/components/primitives/Table/Table.tsx";
import { Textarea } from "@/app/ui/components/primitives/Textarea/Textarea.tsx";
import * as styles from "@/app/ui/styles/modules/MetadataPage.css.ts";
import type { ScriptureBurritoMetadataDraft } from "@/core/domain/project/metadataEditor.ts";

export function ScriptureBurritoEditor(args: {
  draft: ScriptureBurritoMetadataDraft;
  onChange: (draft: ScriptureBurritoMetadataDraft) => void;
}) {
  const { draft, onChange } = args;

  function updateIngredient(
    index: number,
    key: keyof ScriptureBurritoMetadataDraft["ingredients"][number],
    value: string,
  ) {
    const ingredients = draft.ingredients.map((ingredient, currentIndex) =>
      currentIndex === index ? { ...ingredient, [key]: value } : ingredient,
    );
    onChange({ ...draft, ingredients });
  }

  return (
    <div className={styles.metadataSection}>
      <h4 className={styles.metadataSectionTitle}>Language</h4>
      <div className={styles.formRowGrow}>
        <TextInput
          label="Tag"
          value={draft.language.tag}
          onChange={(event) =>
            onChange({
              ...draft,
              language: {
                ...draft.language,
                tag: event.currentTarget.value,
              },
            })
          }
        />
        <TextInput
          label="English Name"
          value={draft.language.englishName}
          onChange={(event) =>
            onChange({
              ...draft,
              language: {
                ...draft.language,
                englishName: event.currentTarget.value,
              },
            })
          }
        />
        <TextInput
          label="Direction"
          value={draft.language.direction}
          onChange={(event) =>
            onChange({
              ...draft,
              language: {
                ...draft.language,
                direction: event.currentTarget.value === "rtl" ? "rtl" : "ltr",
              },
            })
          }
        />
      </div>
      <div className={styles.formRowGrow}>
        <TextInput
          label="Local Name Locale"
          value={draft.language.localNameLocale}
          onChange={(event) =>
            onChange({
              ...draft,
              language: {
                ...draft.language,
                localNameLocale: event.currentTarget.value,
              },
            })
          }
        />
        <TextInput
          label="Local Name"
          value={draft.language.localName}
          onChange={(event) =>
            onChange({
              ...draft,
              language: {
                ...draft.language,
                localName: event.currentTarget.value,
              },
            })
          }
        />
      </div>

      <div className={styles.formRowGrow}>
        <TextInput
          label="Date Created"
          value={draft.meta.dateCreated}
          onChange={(event) =>
            onChange({
              ...draft,
              meta: {
                ...draft.meta,
                dateCreated: event.currentTarget.value,
              },
            })
          }
        />
        <Checkbox
          label="Confidential"
          checked={draft.meta.confidential}
          onChange={(event) =>
            onChange({
              ...draft,
              meta: {
                ...draft.meta,
                confidential: event.currentTarget.checked,
              },
            })
          }
        />
      </div>

      <Textarea
        label="Localized Names JSON"
        minRows={12}
        autosize
        value={draft.localizedNamesText}
        onChange={(event) =>
          onChange({
            ...draft,
            localizedNamesText: event.currentTarget.value,
          })
        }
      />

      <h4 className={styles.metadataSectionTitle}>Ingredients</h4>
      <Table striped withBorder>
        <TableHead>
          <TableRow>
            <TableHeader>Path</TableHeader>
            <TableHeader>Book Code</TableHeader>
            <TableHeader>Title</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {draft.ingredients.map((ingredient, index) => (
            <TableRow key={`${ingredient.path}-${index}`}>
              <TableCell>
                <TextInput
                  value={ingredient.path}
                  onChange={(event) =>
                    updateIngredient(index, "path", event.currentTarget.value)
                  }
                />
              </TableCell>
              <TableCell>
                <TextInput
                  value={ingredient.bookCode}
                  onChange={(event) =>
                    updateIngredient(
                      index,
                      "bookCode",
                      event.currentTarget.value,
                    )
                  }
                />
              </TableCell>
              <TableCell>
                <TextInput
                  value={ingredient.title}
                  onChange={(event) =>
                    updateIngredient(index, "title", event.currentTarget.value)
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
