// Box Office uses the Mac's own typefaces (SF Pro Text / SF Pro Display / SF Mono)
// through the system font stack defined in app/globals.css (--font-sans,
// --font-display, --font-mono). Nothing is downloaded or bundled, so the app
// reads like a native Mac app and an offline build never contacts a font host.
//
// These objects keep the shape the components already use (`.className`,
// `.variable`): `instrumentSerif.className` now resolves to the bold system
// display style (`bo-display`), so every page title switches in one place.
type SystemFont = { readonly className: string; readonly variable: string };

export const inter: SystemFont = { className: "font-sans", variable: "" };
export const instrumentSerif: SystemFont = { className: "bo-display", variable: "" };
export const instrumentSerifItalic: SystemFont = { className: "bo-display italic", variable: "" };
