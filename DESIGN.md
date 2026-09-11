---
name: Obsidian Kinetic
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#191c22'
  surface-container: '#1d2026'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2eb'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#d2bbff'
  on-tertiary: '#3f008e'
  tertiary-container: '#a476ff'
  on-tertiary-container: '#36007d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#eaddff'
  tertiary-fixed-dim: '#d2bbff'
  on-tertiary-fixed: '#25005a'
  on-tertiary-fixed-variant: '#5a00c6'
  background: '#10131a'
  on-background: '#e1e2eb'
  surface-variant: '#32353c'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Sora
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Sora
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-xl:
    fontFamily: Manrope
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Sora
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Sora
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Sora
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  spacing-3xs: 0.125rem
  spacing-2xs: 0.25rem
  spacing-xs: 0.5rem
  spacing-sm: 0.75rem
  spacing-md: 1rem
  spacing-lg: 1.25rem
  spacing-xl: 1.5rem
  spacing-2xl: 2rem
  spacing-3xl: 2.5rem
  spacing-4xl: 3rem
  gutter-mobile: 1rem
  margin-mobile: 1.25rem
---

## Brand & Style

This design system delivers a high-end, editorial gaming portal engineered for mobile-first discovery. Rejecting chaotic, hyper-saturated gamer clichés and noisy RGB animations, it embraces an architectural, dark-luxury aesthetic. Visual cues draw from minimalist art monographs and high-performance automotive software interfaces.

### Brand Personality & Tone
- **Curated & Discerning:** Content is presented like an exclusive gallery of interactive experiences rather than a digital storefront bargain bin.
- **Kinetic Precision:** Interactions are tight, weighted, and responsive, evoking precision-machined mechanical interfaces.
- **Unapologetic Depth:** Rich, deep obsidian surfaces set an immersive canvas where game cover art, high-definition cinematics, and vivid typography command undivided attention.

### Design Language
The style fuses **Premium Dark Glassmorphism** with **Architectural Minimalism**. UI panels leverage deep layered obsidian with sub-perceptual violet undertones, ultra-fine boundary borders (1px with luminous transparency), and focused flashes of electric violet and cybernetic teal. Dynamic content—hero key art, gameplay trailers, and editorial write-ups—occupies primary focus while system furniture gracefully steps back.

## Colors

The palette is engineered specifically for OLED displays and deep-focus viewing. Pure black is avoided in favor of Obsidian Black (`#0B0E14`), which preserves atmospheric depth when overlaid with glass elements and subtle backlights.

### Surface Tiers
- **Canvas Base (`#0B0E14`):** The foundational viewport background.
- **Surface Low (`#12161F`):** Recessed containers, inset search bars, and carousel tracks.
- **Surface Container (`#161B22`):** Primary cards, list items, and modal layers.
- **Surface High (`#1F2633`):** Elevated overlays, floating menus, popovers, and interactive states.
- **Surface Glass (`rgba(22, 27, 34, 0.72)`): Frosted panels with `backdrop-filter: blur(16px)` and a crisp `rgba(255, 255, 255, 0.08)` border.

### Accents & Signal Colors
- **Electric Violet (`#8B5CF6`):** The core brand anchor. Used for primary CTAs, active status indicators, progress meters, and key highlights.
- **Deep Violet / Active Shade (`#7C3AED`):** Pressed states, high-contrast badges, and dynamic radiant glows.
- **Cyber Emerald / Secondary (`#10B981`):** Applied with deliberate restraint to mark metacritic scores, new releases, achievement pings, and positive performance metrics.
- **Text Primary (`#F9FAFB`):** 98% contrast for paramount legibility.
- **Text Secondary (`#94A3B8`):** Subheadings, editorial bylines, and technical metadata.
- **Text Muted (`#64748B`):** Timestamps, deactivated states, and structural hints.

## Typography

The typographic hierarchy pairs the tech-forward, geometric authority of **Sora** with the balanced, highly legible rhythm of **Manrope**.

- **Sora** anchors all headlines, badges, labels, and numeric readouts (scores, percentages, stats). Its wide geometric stance provides punchy visibility even against cinematic video stills.
- **Manrope** governs all descriptive and body prose, long-form editorial reviews, and technical release notes. Its optimized optical proportions ensure fluid readability at dense scales.

### Hierarchy & Mobile Scaling Rules
- Display sizes (`display-lg`) are reserved strictly for featured game cover title cards and promotional launch splashes.
- Micro-labels (`label-sm`, `label-md`) must enforce uppercase transformation (`text-transform: uppercase`) with positive tracking to optimize scannability on compact screens.
- All numbers, ratings, and platform specs utilize Sora with tabular lining figures to maintain exact horizontal alignment across tabular lists.

## Layout & Spacing

The layout is built around a baseline 4px/8px modular rhythm, explicitly optimized for the standard modern mobile viewport (390px × 844px and proportional mobile devices).

### Mobile Grid Mechanics
- **Columns:** 4 fluid columns on mobile viewports.
- **Outer Screen Margin:** 20px (`1.25rem`) providing comfortable thumb borders.
- **Internal Gutter:** 16px (`1rem`) between side-by-side cards.
- **Scroll Edge Bleed:** Horizontal card reels (featured games, upcoming trailers, trending categories) bleed to the screen edge with a trailing 20px padding to invite gesture swiping.

### Thumb-Zone Optimization
Interactive targets (search triggers, quick-save bookmarks, filter tabs, play buttons) are weighted heavily in the bottom 45% of the mobile viewport. The bottom navigation bar occupies 64px height, suspended above the iOS home-indicator safe area with a translucent frosted treatment.

## Elevation & Depth

Depth is established not through generic drop shadows, but through tonal illumination and glass refraction.

### Depth Hierarchy
1. **Recessed (Level 0):** `#0B0E14` base canvas with subtle nested cards (`#12161F`) inset with a 1px border `rgba(255, 255, 255, 0.03)`.
2. **Standard Surface (Level 1):** `#161B22` with a 1px top border of `rgba(255, 255, 255, 0.08)` and bottom border of `rgba(0, 0, 0, 0.4)` simulating a sharp overhead rim light.
3. **Elevated Card (Level 2):** `#1F2633` backed by a localized ambient bloom: `0 8px 24px -4px rgba(0, 0, 0, 0.6)`.
4. **Hero Glass Overlay (Level 3):** Floating sticky headers and persistent player widgets feature `background: rgba(22, 27, 34, 0.75); backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.12)`.
5. **Interactive Glow (Active Accent):** Focused elements and primary CTAs project an electric violet aura: `box-shadow: 0 0 20px 2px rgba(139, 92, 246, 0.35)`.

## Shapes

Roundedness level `2` sets the standard radius across the system. The form factor balances modern fluid curves with the precision geometry expected of high-end consumer hardware.

### Radius System
- **Default Base (`rounded-base`):** `0.5rem` (8px) — Used for chips, pills, micro badges, and input elements.
- **Intermediate (`rounded-lg`):** `1rem` (16px) — Applied to standard interactive cards, modular list items, and modal dialogs.
- **Signature Curve (`rounded-xl`):** `1.5rem` (24px) — Reserved for hero carousel feature cards, game trailer viewports, and primary bottom sheet draws.
- **Pill (`rounded-full`):** `9999px` — Exclusively reserved for status dots, user avatars, tag counters, and icon-only round buttons.

## Components

### Buttons
- **Primary Action:** Solid `#8B5CF6` gradient down to `#7C3AED`, text in `#FFFFFF`, font `Sora` semi-bold (`label-lg`), height 48px, radius `1rem` (16px). Active press scales to `98%` with an intensified purple ambient glow.
- **Secondary Glass:** `rgba(255, 255, 255, 0.06)` background, 1px border `rgba(255, 255, 255, 0.12)`, text `#F9FAFB`. Pressed state shifts background to `rgba(255, 255, 255, 0.12)`.
- **Icon Action:** 44px × 44px minimum bounding box with centered 20px vector glyphs, encased in soft obsidian glass.

### Chips & Badges
- **Category Filter Chips:** 36px height, `rounded-base` (8px). Inactive: `#161B22` with muted gray text `#94A3B8`. Selected: `#8B5CF6` tint at `15%` opacity, border 1px `#8B5CF6`, text `#F9FAFB`.
- **Score / Meta Rating Badge:** Compact pill or rounded box featuring bold `Sora` figures. Positive rating utilizes deep teal `#10B981` tint (`rgba(16, 185, 129, 0.16)`) with `#10B981` typography.

### Game Discovery Cards
- **Hero Showcase Card:** 16:9 or 4:5 aspect ratio, `1.5rem` (24px) radius. Full bleed cover art, progressive gradient scrim from bottom (`#0B0E14` 100% to transparent 40%), overlaying game title, genre badges, release date, and trailer trigger.
- **Compact Feed Card:** Horizontal row format, 80px thumbnail with `0.75rem` (12px) radius, two-line title/developer text, and inline trailing bookmark toggle.

### Lists & Navigation
- **Navigation Bar:** Fixed bottom dock, 64px height plus safe area padding. Frosted glass finish, 4 primary tab items with 22px vector icons. Selected tab illuminates with an electric violet dot indicator below the icon.
- **List Separators:** Zero solid stroke lines. Content separation is handled purely through 12px vertical spacing and alternating tonal surfaces (`#161B22`).

### Input Fields
- **Search Bar:** Height 44px, background `#12161F`, border 1px `rgba(255, 255, 255, 0.06)`, `rounded-lg` (16px). Inset search glyph on the left in `#64748B`. Placeholder text `#64748B`. Focus state transitions border to `#8B5CF6` with zero layout jitter.