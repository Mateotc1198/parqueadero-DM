import { LABELS } from "../constants/labels.js";

/**
 * Small DOM helpers.
 *
 * The important one is applyLabels: index.html carries no Spanish text at all, only
 * data-label attributes naming a key. Every visible string is written from labels.js on
 * boot, which is what makes the centralization rule verifiable rather than a promise: grep
 * the markup for Spanish and nothing comes back.
 */

const LABEL_TEXT_ATTRIBUTE = "data-label";
const LABEL_PLACEHOLDER_ATTRIBUTE = "data-label-placeholder";
const LABEL_ARIA_ATTRIBUTE = "data-label-aria";

/** Resolves a dotted key such as "ENTRY_FORM.TITLE" against the labels tree. */
const resolveLabel = (key) =>
  key.split(".").reduce((value, segment) => (value === undefined ? undefined : value[segment]), LABELS);

const applyAttribute = (root, attribute, assign) => {
  for (const element of root.querySelectorAll(`[${attribute}]`)) {
    const key = element.getAttribute(attribute);
    const text = resolveLabel(key);

    if (text === undefined) {
      // A typo in a key would otherwise show up as a blank interface with no explanation.
      console.warn(`Unknown label key: ${key}`);
      continue;
    }

    assign(element, text);
  }
};

/** Writes every Spanish string of the markup, reading it from labels.js. */
export const applyLabels = (root = document) => {
  applyAttribute(root, LABEL_TEXT_ATTRIBUTE, (element, text) => {
    element.textContent = text;
  });

  applyAttribute(root, LABEL_PLACEHOLDER_ATTRIBUTE, (element, text) => {
    element.setAttribute("placeholder", text);
  });

  applyAttribute(root, LABEL_ARIA_ATTRIBUTE, (element, text) => {
    element.setAttribute("aria-label", text);
  });
};

/** Throws instead of returning null, so a renamed id fails loudly at boot. */
export const selectElement = (selector, root = document) => {
  const element = root.querySelector(selector);

  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  return element;
};

export const createElement = (tagName, { className, text, attributes } = {}) => {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    // textContent, never innerHTML: any value coming from the API is treated as text, so a
    // plate or a description can never be interpreted as markup.
    element.textContent = text;
  }

  for (const [name, value] of Object.entries(attributes ?? {})) {
    element.setAttribute(name, value);
  }

  return element;
};

export const clearElement = (element) => {
  element.replaceChildren();
};

export const setHidden = (element, isHidden) => {
  element.hidden = isHidden;
};
