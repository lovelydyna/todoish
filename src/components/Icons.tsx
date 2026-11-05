/** Small stroke icons, drawn on one 16px grid so they share a visual weight
 *  (the old unicode glyphs rendered at different sizes per font). */

const svg = (d: string) => () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
    <path d={d} />
  </svg>
);

export const PlusIcon = svg("M8 3.5v9M3.5 8h9");
export const NoteIcon = svg("M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4");
export const GearIcon = svg(
  "M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"
);
export const CloseIcon = svg("M4.5 4.5l7 7M11.5 4.5l-7 7");
export const ChevronLeftIcon = svg("M9.5 4 5.5 8l4 4");
export const ChevronRightIcon = svg("M6.5 4l4 4-4 4");
export const ChevronDownIcon = svg("M4 6.5l4 4 4-4");
export const AppearanceIcon = svg("M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 2v12");
export const DatabaseIcon = svg(
  "M3 4c0-1 2.2-1.8 5-1.8s5 .8 5 1.8-2.2 1.8-5 1.8S3 5 3 4zM3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8"
);
export const ClockIcon = svg("M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 4.8V8l2.2 1.4");
export const KeyboardIcon = svg(
  "M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h-.5M5 9.5h6"
);
