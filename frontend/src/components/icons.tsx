/**
 * Inline stroke icons (24px grid, currentColor). Kept in-repo rather than
 * adding an icon dependency; each is a plain SVG with no runtime cost.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Icon>
);
export const IconHandshake = (p: IconProps) => (
  <Icon {...p}><path d="m11 17 2 2a1.4 1.4 0 0 0 2-2" /><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a5 5 0 0 1 5.6-1l.6.3a3 3 0 0 0 1.7.3H21" /><path d="M21 3v10h-2" /><path d="M3 3v10h2l3.5 3.5a1.4 1.4 0 0 0 2-2" /><path d="M3 4h7" /></Icon>
);
export const IconBox = (p: IconProps) => (
  <Icon {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></Icon>
);
export const IconTag = (p: IconProps) => (
  <Icon {...p}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></Icon>
);
export const IconWarehouse = (p: IconProps) => (
  <Icon {...p}><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8" /><path d="M7 17h10" /></Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14a6 6 0 0 1 3.5 6" /></Icon>
);
export const IconInbox = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
export const IconQuote = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8 9h8M8 12h8M8 15h5" /></Icon>
);
export const IconInvoice = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 11h7M9 14h7M9 17h4" /></Icon>
);
export const IconWallet = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18" /><path d="M16 14h2" /></Icon>
);
export const IconTruck = (p: IconProps) => (
  <Icon {...p}><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></Icon>
);
export const IconChart = (p: IconProps) => (
  <Icon {...p}><path d="M3 3v18h18" /><path d="M8 17v-5M12 17V8M16 17v-8M20 17v-3" /></Icon>
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>
);
export const IconImage = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const IconEye = (p: IconProps) => (
  <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>
);
export const IconPencil = (p: IconProps) => (
  <Icon {...p}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></Icon>
);
export const IconDots = (p: IconProps) => (
  <Icon {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
);
export const IconDownload = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></Icon>
);
export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
);
export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
);
export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const IconSort = (p: IconProps) => (
  <Icon {...p}><path d="m8 9 4-4 4 4" /><path d="m16 15-4 4-4-4" /></Icon>
);
export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Icon>
);
export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Icon>
);
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const IconCheckCircle = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Icon>
);
export const IconPause = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const IconTrash = (p: IconProps) => (
  <Icon {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /></Icon>
);
export const IconArchive = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9" /><path d="M10 13h4" /></Icon>
);
export const IconScan = (p: IconProps) => (
  <Icon {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 9h10M7 12h10M7 15h6" /></Icon>
);
export const IconFile = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></Icon>
);
export const IconUser = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
);
export const IconMapPin = (p: IconProps) => (
  <Icon {...p}><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></Icon>
);
export const IconPhone = (p: IconProps) => (
  <Icon {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></Icon>
);
export const IconMail = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>
);
export const IconGlobe = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>
);
export const IconClock = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
export const IconStar = (p: IconProps) => (
  <Icon {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" /></Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 2 20h20Z" /><path d="M12 10v4M12 17h.01" /></Icon>
);
export const IconHelpBubble = (p: IconProps) => (
  <Icon {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 15.5Z" /><path d="M9.8 8.2a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3" /><path d="M12 14.2h.01" /></Icon>
);
export const IconDocument = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6M9 9h1" /></Icon>
);
export const IconCard = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><path d="M7 15h3" /><path d="M15.5 15.5a1.5 1.5 0 1 0 2.5-1" /></Icon>
);
export const IconBarChart = (p: IconProps) => (
  <Icon {...p}><path d="M4 20h16" /><path d="M6.5 20v-6M10.5 20V9M14.5 20V5M18.5 20v-9" /></Icon>
);
export const IconPalette = (p: IconProps) => (
  <Icon {...p}><path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /><circle cx="17" cy="10.5" r="1" /></Icon>
);
export const IconCube = (p: IconProps) => (
  <Icon {...p}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /><path d="m8 5.3 8 4.5" /></Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Icon>
);
export const IconMenu = (p: IconProps) => (
  <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>
);
export const IconLogout = (p: IconProps) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
);
