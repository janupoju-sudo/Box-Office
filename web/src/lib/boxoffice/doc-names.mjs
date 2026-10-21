// Box Office: file names for saved application documents.

/**
 * "Company - Role - CV.pdf", safe on macOS, Windows and Linux.
 * @param {string} company
 * @param {string} role
 * @param {string} label
 */
export function docFileName(company, role, label) {
  const part = (s, max) =>
    String(s || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .replace(/[. ]+$/, "");
  const pieces = [part(company, 60) || "Company", part(role, 80), label].filter(Boolean);
  return `${pieces.join(" - ")}.pdf`;
}
