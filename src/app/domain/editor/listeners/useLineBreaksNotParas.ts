import {
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_LOW,
    INSERT_LINE_BREAK_COMMAND,
    INSERT_PARAGRAPH_COMMAND,
    type LexicalEditor,
} from "lexical";

export function redirectParaInsertionToLineBreak(editor: LexicalEditor) {
    return editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        (_event: KeyboardEvent) => {
            editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
            return true;
        },
        COMMAND_PRIORITY_LOW,
    );
}
