/** A small, consistent line icon set (24px grid, 1.75 stroke). Decorative unless labelled by its button. */
const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  desktop: 'M3 4h18v12H3zM8 20h8M12 16v4',
  tablet: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  back: 'M15 6l-6 6 6 6',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  warn: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
  sparkle:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  key: 'M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 20 13.4M17.5 11l-2 2M20 13.4l-2 2',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'grip' ? 3 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
