# Tradstry White Editorial Website Design

## Goal

Redesign the Tradstry marketing website as a white, editorial product story inspired by the structure and pacing of jallen.co while keeping Tradstry's own product claims, screenshots, orange accent, pricing, legal content, and conversion paths.

The redesign must make the product easier to understand by replacing the current collection of dense marketing sections with one clear sequence: record the trade, understand the result, compare it with the plan, preserve the lesson, and ask the connected record questions.

## Scope

This design covers the public marketing homepage and the landing-page components it owns. It preserves the existing Terms, Privacy, Refund, Support, authentication, pricing facts, analytics events, structured data, and public route behavior.

It does not rebuild billing, the authenticated dashboard, or the Tradstry application shell.

## Visual System

- White page background with near-black primary text and neutral gray supporting text.
- Tradstry orange is reserved for selected navigation, data highlights, gallery progress, and primary actions.
- Geist remains the typeface so the redesign does not add a font dependency.
- Thin neutral borders, small corner radii, quiet gray media frames, and minimal shadows.
- A subtle grid texture may appear in the hero but must not continue through every section.
- Remove the dark gradients, glowing orbit, metric tape, and dense dashboard-style marketing cards.
- Product screenshots carry most of the visual weight.

## Page Story

### 1. Hero

Headline: **Your trading record should talk back.**

The supporting copy explains that Tradstry connects broker activity, trading rules, journal context, and AI into one record. The primary action is **Start free**. The secondary action is **View product** and moves to the Journal story.

The hero uses a two-column desktop layout with copy on the left and the dashboard visual on the right. On mobile, copy appears above the visual.

### 2. Journal

Headline: **Every fill, already there.**

Show brokerage imports, matched trades, notes, tags, charts, and planned risk. The story should make clear that a fill enters the record once and gains context through review.

### 3. Analytics

Headline: **Know what is working, and why.**

Show expectancy, drawdown, win rate, symbol patterns, and discipline comparisons. Claims must stay retrospective and must not imply investment advice or predicted returns.

### 4. Playbooks

Headline: **Put your rules next to the trades that tested them.**

Show the written setup rules and compare trades that followed the plan with trades that broke it. This is the clearest expression of Tradstry's product difference.

### 5. Notebook

Headline: **Keep the lesson with the trade.**

Show connected notes, images, offline editing, and autocomplete. Explain that notes remain attached to the record they describe.

### 6. Tradstry AI

Headline: **Ask your record, not a blank model.**

Show a real user question, visible tool activity, supporting evidence, and the final answer. The presentation must distinguish retrieved facts from AI interpretation.

### 7. MCP

Headline: **Take your trading record into the AI tools you already use.**

Show the connection setup, available tools, example questions, and privacy boundaries. Explain MCP in plain language before showing configuration code.

### 8. Pricing and Support

Present Free and Pro plans using white cards with simple borders. Preserve current prices, renewal wording, tax note, non-advice disclosure, and links to Terms, Refund Policy, and Support.

The FAQ and footer follow pricing. The footer remains compact and keeps product, learning, legal, and support links.

## Navigation

Desktop uses a fixed 120px left rail. The Tradstry identity sits at the top. Section links sit lower in the rail and follow the page story order:

1. Journal
2. Analytics
3. Playbooks
4. Notebook
5. Tradstry AI
6. MCP
7. Pricing
8. FAQ

The active link updates as its section enters the reading position. Clicking a link scrolls to the section with the correct offset and updates the URL hash without causing layout jumps.

Below the desktop breakpoint, the rail becomes a compact sticky header with a menu for section links, Sign in, and Start free.

## Product Story Component

Each feature story shares one reusable structure:

1. A large 16:9 media gallery.
2. Small numbered tabs or progress dots.
3. Feature name and outcome-focused headline.
4. One short explanation.
5. One optional action.

The gallery accepts a list of local images and their alternative text. Only one image is interactive at a time. Changing slides updates the selected tab and accessible label.

Desktop places the text beneath the media in a balanced grid. Mobile stacks the title, explanation, and action. Mobile galleries support horizontal swiping while keeping visible progress controls.

## Component Structure

- `LandingShell`: white marketing shell and shared page width.
- `EditorialNavigation`: desktop rail and mobile header behavior.
- `EditorialHero`: headline, actions, and lead product visual.
- `ProductStory`: reusable feature section.
- `ProductGallery`: image tabs, swipe behavior, labels, and crossfade.
- `EvidenceStrip`: small factual product evidence used only where it supports a story.
- `Pricing`: restyled current plan logic without changing plan data.
- `Faq`: restyled current FAQ data and disclosure behavior.
- `Footer`: existing legal-ready content adapted to the new visual system.

Page copy, gallery items, and section metadata should live in the landing content module rather than being repeated across components.

## Motion

- Navigation caused by keyboard input is instant.
- Gallery changes may crossfade over 160 to 200 milliseconds with a strong ease-out curve.
- Buttons use a subtle pressed state around `scale(0.97)`.
- Marketing images may fade into view once, but content must never wait for animation before becoming usable.
- `prefers-reduced-motion` removes transforms and keeps only short opacity changes.
- No permanent ambient animation replaces the current trading orbit.

## Accessibility

- Preserve a skip link to the main content.
- Use one page heading and correctly ordered section headings.
- Navigation exposes the current section with `aria-current`.
- Gallery controls use tabs or buttons with descriptive labels.
- Every product image has useful alternative text.
- Focus rings must be visible against white and gray surfaces.
- Touch targets remain at least 44px where controls are compact.
- Color is never the only way to identify selected, profit, or loss states.

## Responsive Behavior

- Desktop: fixed rail, wide 1088px content column, full-screen hero, and large media stories.
- Laptop: narrower content gutters while retaining the rail until it stops leaving enough reading width.
- Tablet and mobile: sticky top header, stacked hero, near-edge media, stacked story text, swipe galleries, and vertically stacked pricing cards.
- Long headings must wrap naturally without fixed heights.
- Anchored navigation must account for the sticky mobile header.

## Data and Interaction Flow

The homepage remains static and reads section data from the landing content module. The selected gallery slide is local component state. The active navigation section is derived from section visibility in the viewport.

Sign-up and sign-in continue through the current Clerk integration. Existing analytics events remain attached to primary actions. Pricing remains presentation-only until the billing rebuild is approved and implemented separately.

If JavaScript is unavailable, all story copy and the first image from each gallery remain visible, anchor links still work, and pricing and legal links remain usable.

## Failure Handling

- A missing gallery image displays a neutral media frame without collapsing the section.
- Navigation falls back to normal anchor behavior when section observation is unavailable.
- The page must not hide content behind animation or hydration state.
- Existing public legal and support routes remain accessible even if authentication services are unavailable.

## Verification

- Component tests cover section order, pricing facts, navigation metadata, and gallery selection.
- Existing content tests continue to validate pricing and public claims.
- TypeScript and the website production build must pass.
- Visual checks cover 1440px desktop, 1024px laptop, 768px tablet, and 390px mobile widths.
- Keyboard checks cover skip navigation, section navigation, gallery controls, Sign in, and Start free.
- Reduced-motion mode is checked manually.
- Public Terms, Privacy, Refund, and Support routes are rechecked after the shell changes.

## Reference Material

Research captures from jallen.co are stored under `docs/design/reference/jallen/`. They are internal visual references only and must not be shipped as Tradstry assets.
