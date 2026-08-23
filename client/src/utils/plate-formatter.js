/**
 * Plate formatting for the input fields.
 *
 * The backend normalizes with trim and uppercase only, so a plate typed as "abc-123" would
 * be rejected. Cleaning it here as the user types is the difference between a form that
 * feels forgiving and one that scolds you for a dash.
 */

const PLATE_MAX_LENGTH = 6;
const DISALLOWED_CHARACTERS = /[^A-Z0-9]/g;

const stripDisallowedCharacters = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(DISALLOWED_CHARACTERS, "");

export const formatPlate = (value) => stripDisallowedCharacters(value).slice(0, PLATE_MAX_LENGTH);

/**
 * Formats the field in place while keeping the caret where the user left it.
 *
 * Simply assigning input.value would send the caret to the end, which makes correcting a
 * character in the middle of a plate impossible.
 */
export const applyPlateFormatting = (input) => {
  const previousValue = input.value;
  const formattedValue = formatPlate(previousValue);

  if (formattedValue === previousValue) {
    return;
  }

  const caretPosition = input.selectionStart ?? previousValue.length;
  const textBeforeCaret = previousValue.slice(0, caretPosition);
  const removedBeforeCaret = textBeforeCaret.length - stripDisallowedCharacters(textBeforeCaret).length;
  const nextCaretPosition = Math.min(Math.max(caretPosition - removedBeforeCaret, 0), formattedValue.length);

  input.value = formattedValue;
  input.setSelectionRange(nextCaretPosition, nextCaretPosition);
};
