/**
 * VCoder Design System - Token Reference
 *
 * This file serves as documentation for the VCoder design tokens.
 * For the actual token definitions, see index.scss and theme.scss
 *
 * ========================================
 * TABLE OF CONTENTS
 * ========================================
 *
 * 1. Typography System
 * 2. Color System
 * 3. Spacing System (8-Point Grid)
 * 4. Border Radius System
 * 5. Shadow / Elevation System
 * 6. Motion / Animation System
 * 7. Z-Index System
 * 8. Scrollbar System
 * 9. Component-Specific Tokens
 *
 * ========================================
 * TOKEN NAMING CONVENTION
 * ========================================
 *
 * --vc-{category}-{property}-{variant}-{state}
 *
 * Categories:
 * - color: All color-related tokens
 * - typography: Font family, size, weight, line-height
 * - spacing: All spacing values
 * - radius: Border radius values
 * - shadow: Box shadows
 * - motion: Animation duration, easing
 * - z-index: Z-index layering
 *
 * ========================================
 * 1. TYPOGRAPHY SYSTEM
 * ========================================
 *
 * Font Families:
 * --vc-font-family-base      : Base font (from VS Code)
 * --vc-font-family-code      : Monospace font (from VS Code)
 *
 * Font Sizes (Modular Scale - Major Third 1.25):
 * --vc-font-size-xs         : 11px - Labels, tags
 * --vc-font-size-sm         : 12px - Captions, hints
 * --vc-font-size-md         : 13px - Base body text
 * --vc-font-size-lg         : 14px - Subheadings
 * --vc-font-size-xl         : 16px - Headings
 * --vc-font-size-2xl        : 18px - Large headings
 * --vc-font-size-3xl        : 20px - Page titles
 *
 * Line Heights:
 * --vc-line-height-tight    : 1.25
 * --vc-line-height-snug     : 1.4
 * --vc-line-height-normal   : 1.55
 * --vc-line-height-relaxed  : 1.7
 * --vc-line-height-loose    : 1.9
 *
 * Font Weights:
 * --vc-font-weight-light    : 300
 * --vc-font-weight-regular : 400
 * --vc-font-weight-medium  : 500
 * --vc-font-weight-semibold : 600
 * --vc-font-weight-bold    : 700
 *
 * Letter Spacing:
 * --vc-letter-spacing-tight   : -0.01em
 * --vc-letter-spacing-normal  : 0
 * --vc-letter-spacing-wide    : 0.02em
 * --vc-letter-spacing-wider   : 0.05em
 *
 * ========================================
 * 2. COLOR SYSTEM
 * ========================================
 *
 * Background Colors:
 * --vc-color-bg-base        : Editor background
 * --vc-color-bg-secondary   : 92% mix with foreground
 * --vc-color-bg-tertiary    : 86% mix with foreground
 * --vc-color-bg-elevated    : 96% mix with white
 *
 * Text Colors:
 * --vc-color-text-primary    : Main text color
 * --vc-color-text-secondary  : Description text
 * --vc-color-text-tertiary   : 70% opacity secondary
 * --vc-color-text-inverse    : #ffffff
 * --vc-color-text-disabled   : 50% opacity primary
 *
 * Border Colors:
 * --vc-color-border          : Main border color
 * --vc-color-border-secondary : 70% opacity border
 * --vc-color-border-tertiary  : 40% opacity border
 * --vc-color-border-focus     : Focus ring color
 *
 * Semantic Colors:
 *
 * Success:
 * --vc-color-success-text   : Success text color
 * --vc-color-success-bg     : 12% success text
 * --vc-color-success-bg-hover : 18% success text
 * --vc-color-success-border : 35% success text
 *
 * Warning:
 * --vc-color-warning-text   : Warning text color
 * --vc-color-warning-bg     : 12% warning text
 * --vc-color-warning-bg-hover : 18% warning text
 * --vc-color-warning-border : 35% warning text
 *
 * Error:
 * --vc-color-error-text     : Error text color
 * --vc-color-error-bg       : 12% error text
 * --vc-color-error-bg-hover : 18% error text
 * --vc-color-error-border   : 35% error text
 *
 * Info:
 * --vc-color-info-text      : Info text color
 * --vc-color-info-bg        : 12% info text
 * --vc-color-info-bg-hover  : 18% info text
 * --vc-color-info-border    : 35% info text
 *
 * Interaction States:
 * --vc-color-hover-bg       : Hover background
 * --vc-color-selected-bg    : Selected background
 * --vc-color-selected-fg    : Selected foreground
 * --vc-color-focus-ring     : Focus ring color
 *
 * ========================================
 * 3. SPACING SYSTEM (8-POINT GRID)
 * ========================================
 *
 * Base unit: 8px
 *
 * Numeric Values:
 * --vc-space-0 : 0
 * --vc-space-1 : 4px   (0.5x)
 * --vc-space-2 : 8px   (1x)
 * --vc-space-3 : 12px  (1.5x)
 * --vc-space-4 : 16px  (2x)
 * --vc-space-5 : 20px  (2.5x)
 * --vc-space-6 : 24px  (3x)
 * --vc-space-7 : 32px  (4x)
 * --vc-space-8 : 40px  (5x)
 * --vc-space-9 : 48px  (6x)
 *
 * Semantic Aliases:
 * --vc-spacing-tightest    : 4px
 * --vc-spacing-tighter     : 8px
 * --vc-spacing-tight       : 12px
 * --vc-spacing-normal      : 16px
 * --vc-spacing-relaxed     : 20px
 * --vc-spacing-loose       : 24px
 * --vc-spacing-looser      : 32px
 *
 * Component Spacing:
 * --vc-spacing-component-xs : 4px
 * --vc-spacing-component-sm : 8px
 * --vc-spacing-component-md : 12px
 * --vc-spacing-component-lg : 16px
 * --vc-spacing-component-xl : 20px
 *
 * ========================================
 * 4. BORDER RADIUS SYSTEM
 * ========================================
 *
 * --vc-radius-none  : 0
 * --vc-radius-xs    : 2px   - Tags, badges
 * --vc-radius-sm    : 4px   - Buttons, inputs
 * --vc-radius-md    : 6px   - Panels, containers
 * --vc-radius-lg    : 8px   - Cards, modals
 * --vc-radius-xl    : 10px  - Special containers
 * --vc-radius-2xl   : 12px  - Hero elements
 * --vc-radius-full  : 9999px - Pill shapes
 *
 * ========================================
 * 5. SHADOW / ELEVATION SYSTEM
 * ========================================
 *
 * --vc-shadow-none : none
 * --vc-shadow-xs   : 0 1px 2px rgba(0,0,0,0.05)
 * --vc-shadow-sm   : 0 2px 4px rgba(0,0,0,0.06)
 * --vc-shadow-md   : 0 4px 6px rgba(0,0,0,0.07)
 * --vc-shadow-lg   : 0 10px 15px rgba(0,0,0,0.1)
 * --vc-shadow-xl   : 0 20px 25px rgba(0,0,0,0.15)
 * --vc-shadow-2xl  : 0 25px 50px rgba(0,0,0,0.25)
 *
 * ========================================
 * 6. MOTION / ANIMATION SYSTEM
 * ========================================
 *
 * Durations:
 * --vc-motion-duration-instant : 50ms
 * --vc-motion-duration-fast   : 100ms
 * --vc-motion-duration-mid    : 140ms
 * --vc-motion-duration-slow   : 200ms
 * --vc-motion-duration-slower : 300ms
 * --vc-motion-duration-slowest: 500ms
 *
 * Easing Functions:
 * --vc-motion-ease-linear : linear
 * --vc-motion-ease-in    : cubic-bezier(0.4, 0, 1, 1)
 * --vc-motion-ease-out   : cubic-bezier(0, 0, 0.2, 1)
 * --vc-motion-ease-in-out : cubic-bezier(0.4, 0, 0.2, 1)
 * --vc-motion-ease-bounce : cubic-bezier(0.68, -0.55, 0.265, 1.55)
 *
 * Transition Presets:
 * --vc-transition-fast : 100ms ease-out
 * --vc-transition-mid  : 140ms ease-out
 * --vc-transition-slow : 200ms ease-out
 *
 * ========================================
 * 7. Z-INDEX SYSTEM
 * ========================================
 *
 * --vc-z-index-dropdown      : 1000
 * --vc-z-index-sticky       : 100
 * --vc-z-index-fixed        : 200
 * --vc-z-index-modal-backdrop: 1000
 * --vc-z-index-modal        : 1001
 * --vc-z-index-popover      : 1002
 * --vc-z-index-tooltip      : 1003
 * --vc-z-index-notification : 2000
 *
 * ========================================
 * 8. SCROLLBAR SYSTEM
 * ========================================
 *
 * --vc-scrollbar-width    : 10px
 * --vc-scrollbar-height   : 10px
 * --vc-scrollbar-thumb     : VS Code scroll thumb color
 * --vc-scrollbar-thumb-hover : VS Code scroll thumb hover
 * --vc-scrollbar-thumb-active : VS Code scroll thumb active
 * --vc-scrollbar-track    : transparent
 *
 * ========================================
 * 9. COMPONENT-SPECIFIC TOKENS
 * ========================================
 *
 * Button Component:
 * --vc-button-height-{xs,sm,md,lg,xl}
 * --vc-button-padding-x-{xs,sm,md,lg,xl}
 * --vc-button-gap : 6px
 * --vc-button-icon-size-{sm,md,lg}
 *
 * Input Component:
 * --vc-input-height-{xs,sm,md,lg}
 * --vc-input-padding-y, --vc-input-padding-x
 * --vc-input-border-width : 1px
 * --vc-input-border-color
 * --vc-input-border-focus
 * --vc-input-focus-ring-width : 2px
 *
 * Card Component:
 * --vc-card-border-default
 * --vc-card-shadow-default/hover/elevated
 * --vc-card-header/body/footer-padding
 *
 * Modal Component:
 * --vc-modal-width-{sm,md,lg,xl,full}
 * --vc-modal-padding-{sm,md,lg}
 * --vc-modal-header-height : 56px
 * --vc-modal-footer-height : 56px
 *
 * Dropdown Component:
 * --vc-dropdown-width-{sm,md,lg,xl}
 * --vc-dropdown-item-height : 32px
 * --vc-dropdown-item-padding
 * --vc-dropdown-shadow
 *
 * ========================================
 * USAGE EXAMPLES
 * ========================================
 *
 * Using tokens in SCSS:
 *
 * .my-component {
 *   padding: var(--vc-spacing-component-md);
 *   background: var(--vc-color-bg-secondary);
 *   border-radius: var(--vc-radius-md);
 *   font-size: var(--vc-font-size-sm);
 *   transition: all var(--vc-transition-mid);
 *
 *   &:hover {
 *     background: var(--vc-color-hover-bg);
 *   }
 * }
 *
 * Using mixins:
 *
 * @use 'styles/mixins' as *;
 *
 * .my-button {
 *   @include button-primary;
 * }
 *
 * .my-input {
 *   @include input;
 * }
 *
 * ========================================
 * BACKWARD COMPATIBILITY
 * ========================================
 *
 * Legacy tokens are maintained for backward compatibility:
 * - --vcoder-* tokens (will be deprecated)
 * - --vc-* legacy tokens (will be migrated)
 *
 * Always use new --vc-* tokens for new code.
 *
 * ========================================
 * ACCESSIBILITY
 * ========================================
 *
 * All tokens support:
 * - prefers-reduced-motion: Reduced animations
 * - prefers-contrast: high High contrast mode
 * - prefers-color-scheme: Dark/light mode (when needed)
 *
 * ========================================
 * VS CODE THEME INTEGRATION
 * ========================================
 *
 * All color tokens derive from VS Code theme variables:
 * - var(--vscode-editor-background)
 * - var(--vscode-editor-foreground)
 * - var(--vscode-button-background)
 * - var(--vscode-focusBorder)
 * - etc.
 *
 * This ensures seamless integration with all VS Code themes.
 *
 * ========================================
 * BEST PRACTICES
 * ========================================
 *
 * 1. Always use tokens instead of hardcoded values
 * 2. Use semantic tokens (e.g., --vc-color-text-secondary)
 *    over specific values (e.g., #666666)
 * 3. Use spacing tokens from the 8-point grid
 * 4. Leverage mixins for common patterns
 * 5. Ensure proper contrast ratios for text
 * 6. Test with different VS Code themes
 * 7. Test with reduced motion preferences
 * 8. Test with high contrast mode
 *
 * ========================================
 * MIGRATION GUIDE
 * ========================================
 *
 * Old Token -> New Token
 * ---------------------------
 * --vc-padding -> --vc-spacing-component-md
 * --vc-bg -> --vc-color-bg-base
 * --vc-color-text -> --vc-color-text-primary
 * --vc-color-border -> --vc-color-border
 * --vc-radius-sm -> --vc-radius-sm (unchanged)
 *
 * For a complete migration, see:
 * - index.scss (legacy token mappings)
 */
