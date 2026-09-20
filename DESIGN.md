---
name: Sada-e-Awam Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#404942'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#707971'
  outline-variant: '#c0c9c0'
  surface-tint: '#2d6a48'
  primary: '#003820'
  on-primary: '#ffffff'
  primary-container: '#0f5132'
  on-primary-container: '#84c39b'
  inverse-primary: '#95d4ac'
  secondary: '#0061a6'
  on-secondary: '#ffffff'
  secondary-container: '#6eb2fe'
  on-secondary-container: '#004376'
  tertiary: '#551e22'
  on-tertiary: '#ffffff'
  tertiary-container: '#713437'
  on-tertiary-container: '#f29fa1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b0f1c7'
  primary-fixed-dim: '#95d4ac'
  on-primary-fixed: '#002111'
  on-primary-fixed-variant: '#0f5132'
  secondary-fixed: '#d2e4ff'
  secondary-fixed-dim: '#a0caff'
  on-secondary-fixed: '#001c37'
  on-secondary-fixed-variant: '#00497e'
  tertiary-fixed: '#ffdad9'
  tertiary-fixed-dim: '#ffb3b4'
  on-tertiary-fixed: '#3a090f'
  on-tertiary-fixed-variant: '#713437'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
  background-subtle: '#F8F9FA'
  surface-card: '#FFFFFF'
  border-light: '#E5E7EB'
  status-error: '#DC2626'
  status-warning: '#D97706'
  status-success: '#0F5132'
  status-info: '#1D70B8'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  space-xl: 40px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

The design system is engineered for **Sada-e-Awam**, a civic reporting platform that bridges the gap between Pakistani citizens and government services. The brand personality is **authoritative, transparent, and responsive**. It avoids the clutter of traditional bureaucratic interfaces in favor of a "Gov-Tech Utility" aesthetic—prioritizing speed of task completion and clarity of information.

The visual style is **Premium Corporate**, utilizing the stability of deep emerald tones paired with modern, high-legibility typography. It leverages subtle depth through tonal layering rather than aggressive shadows, ensuring the platform feels like a reliable public utility that is modern enough to be trusted by a digital-native generation.

**Key Principles:**
- **Clarity over Decoration:** Every element must serve a functional purpose in the reporting or tracking flow.
- **Localized Accessibility:** Design patterns must accommodate both English and Urdu scripts with equal visual weight.
- **Civic Trust:** Use of institutional greens and structured layouts to evoke the seriousness of official correspondence.

## Colors

The palette is anchored by **Deep Emerald Green**, a color deeply associated with Pakistani identity and institutional stability. This is supported by a range of functional neutrals and high-visibility status colors.

- **Primary (#0F5132):** Used for primary actions, branding, and active states. It represents the "Voice of the People" (Sada-e-Awam) with gravity.
- **Functional Backgrounds:** We use a tiered approach: `#F8F9FA` for the global canvas and pure `#FFFFFF` for interactive cards and input areas to create a clear "object-on-surface" relationship.
- **Alert System:** Standardized emergency reds and amber warnings are used for urgent infrastructure reports or hazardous status updates, ensuring they stand out against the green primary theme.
- **Borders:** A consistent `#E5E7EB` is used for hair-line borders to define structure without adding visual noise.

## Typography

This design system utilizes a contemporary pairing to balance authority with approachability. 

- **Headlines:** **Hanken Grotesk** provides a sharp, professional frame for page titles and section headers. Its geometric precision ensures it feels modern and "tech-forward."
- **Body & UI:** **Plus Jakarta Sans** is used for all functional text. Its slightly wider apertures and friendly terminals ensure high legibility in long-form reports and dense data tables.
- **Urdu Integration:** While not explicitly tokenized, all containers must support **Noto Sans Arabic** as a fallback. Line-heights for Urdu text should be increased by 20% compared to English counterparts to accommodate the taller ascenders/descenders of the script.
- **Hierarchy:** Use `label-caps` for metadata like timestamps or small status descriptors to differentiate secondary information from primary user input.

## Layout & Spacing

The design system follows a **12-column fixed grid** for desktop, transitioning to a **4-column fluid grid** for mobile. 

- **Rhythm:** A 4px baseline grid ensures vertical consistency. All spacing between elements (margins, padding) must be a multiple of 4.
- **Desktop:** 12 columns with a 24px gutter. Content is centered with a max-width of 1280px to prevent excessive line lengths in reports.
- **Mobile:** 16px side margins are required. Elements should reflow to full-width stacks to maximize the tap targets for reporting forms.
- **Layout Model:** High-density information (like "My Reports" lists) uses `space-sm` for internal padding, while marketing or landing pages use `space-xl` to create a premium, spacious feel.

## Elevation & Depth

To maintain a "Gov-Tech" professional feel, the design system avoids heavy shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Floor):** Background (`#F8F9FA`). No shadows.
- **Level 1 (Cards/Containers):** Pure white surface (`#FFFFFF`) with a 1px solid border of `#E5E7EB`. This is the default state for content cards and report entries.
- **Level 2 (Interaction/Hover):** When a card or button is hovered, apply a very soft, diffused shadow: `0 4px 12px rgba(0, 0, 0, 0.05)`. This provides "lift" without looking like a consumer social app.
- **Separators:** Use horizontal rules in `#E5E7EB` to divide list items, ensuring a clean, tabular structure that is easy to scan.

## Shapes

The shape language is **Rounded**, reflecting a modern and accessible civic experience.

- **Standard Elements:** Buttons, input fields, and small cards use a **0.5rem (8px)** corner radius. This softens the "government" feel without becoming overly playful.
- **Large Containers:** Modals and main feature cards use **1rem (16px)** to create clear visual containment.
- **Status Badges:** Use a fully rounded **Pill-shape** to distinguish status indicators (e.g., "In Progress", "Resolved") from interactive buttons.

## Components

### Buttons
- **Primary:** Solid `#0F5132` with white text. 8px border-radius.
- **Secondary:** Transparent with `#0F5132` border and text. Used for "Cancel" or "Go Back."
- **States:** Hover states should darken the background by 10%. Disabled states use `#E5E7EB` with `#9CA3AF` text.

### Status Badges (Pills)
- Use high-contrast background tints with darker text.
- **Resolved:** Light Green background / Deep Green text.
- **Pending:** Light Amber background / Deep Amber text.
- **Critical:** Light Red background / Deep Red text.

### Segmented Toggles
- Used for switching between "English" and "Urdu" or "Map View" and "List View."
- The container should match the input field background (`#F3F4F6`) with a sliding white pill for the active selection.

### Visual Category Cards
- Used for selecting report types (e.g., "Waste Management," "Power Outage").
- Features a centered icon (24px) in the Primary color, a `headline-sm` label, and a subtle border. On selection, the border thickens to 2px Primary.

### Input Fields
- Labels must always be visible (never placeholder-only) using `body-sm` bold.
- Focus state: 2px solid `#0F5132` border with a soft green glow (3px spread).

### Lists
- Civic reports should be displayed in structured lists with 16px vertical padding between items, separated by a 1px `#E5E7EB` line. Each row must have a trailing chevron to indicate navigation.