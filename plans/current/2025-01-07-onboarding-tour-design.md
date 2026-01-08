# Design: Onboarding Tour Feature

## Overview & Goals

The Onboarding Tour feature provides a guided walkthrough of Dovetail's core functionality for new users who may not be tech-literate. The tour activates on first launch with a gentle opt-in prompt ("Would you like a guided tour of Dovetail?") and remains accessible via Settings for future reference.

The tour covers all major feature areas: project/workspace management, the USFM editor, search & replace, UI navigation, and saving/exporting. It consists of 10-15 steps organized into logical groups, maintaining a moderate length to avoid overwhelming users. Each step uses short, simple language (20-30 words) with a helpful, educational tone that avoids technical jargon.

Users can dismiss the tour at any point—they're never trapped. Once initiated, the app records the tour as "started" in localStorage, and users can only restart it through the Settings menu. The design uses the popular React Joyride library (or equivalent) for reliable, battle-tested tour functionality.

The tour content is built for internationalization from day one using @lingui patterns, even if only English is implemented initially. UI elements are targeted primarily using existing data-testid attributes, with new data-tourid attributes added only when clarity is needed for untourable components.

## Architecture & Component Structure

The tour feature lives entirely in the `src/app` layer since it's purely UI/UX functionality with no core domain logic. Here's how it fits into the architecture:

### Tour Logic Layer (`src/app/ui/tour/`)
- **`TourProvider.tsx`**: Context provider that manages tour state (isTourActive, currentStep, tourCompletionStatus) and wraps the application. Integrates with the tour library (React Joyride).
- **`useTour.ts`**: Hook providing tour controls (startTour, stopTour, resetTour) and state access for components that need to trigger or respond to tour events.
- **`tourConfig.ts`**: Centralized configuration defining all tour steps, grouped by feature area. Each step specifies: target selector (data-testid/data-tourid), content (Lingui translatable), placement, and disableBeacon flags.

### Tour Content (`src/app/ui/tour/steps/`)
- **`index.ts`**: Exports all tour step groups for registration
- Organized by feature groups: `editorSteps.tsx`, `workspaceSteps.tsx`, `searchSteps.tsx`, `navigationSteps.tsx`, `exportSteps.tsx`

### Integration Points
- **`src/app/ui/FirstLaunchPrompt.tsx`**: Modal shown on first launch asking "Would you like a guided tour of Dovetail?" with Yes/No buttons. Uses `useTour` hook to trigger tour start.
- **`src/app/routes/settings.tsx`**: Settings page adds "Retake Tour" button that resets tour state and restarts from step 1.
- **Component targeting**: Existing UI components don't need modification if they have data-testid attributes. For elements needing tour highlighting without test coverage, add `data-tourid="<feature>-<element>"`.

### Storage
- **localStorage key**: `dovetail-tour-status` stores state object: `{ hasSeenPrompt: boolean, hasStartedTour: boolean }`
- Simple key-value storage avoids cross-platform complexity and syncs easily between web/desktop.

## User Flow & State Management

### First Launch Flow
1. App initializes → TourProvider checks localStorage for `dovetail-tour-status`
2. If `hasSeenPrompt` is `false`, show FirstLaunchPrompt modal after app fully loads
3. User selects "Yes" → `hasSeenPrompt` and `hasStartedTour` set to `true` → tour starts from step 1
4. User selects "No" → `hasSeenPrompt` set to `true` → tour not started, app functions normally
5. Modal dismisses and user enters the main application

### Tour Interaction Flow
1. Tour activates → React Joyride displays highlighted element with tooltip
2. Tooltip shows short, simple content with "Next" and "Skip Tour" buttons
3. User navigates through 10-15 steps organized into feature groups (visible in step counter)
4. User can click "Skip Tour" at any time → tour closes, state remains "started"
5. Tour completes on final step → celebration message, tour dismisses

### Restart Flow (Settings)
1. User opens Settings → sees "Retake Tour" button (always visible)
2. Click button → localStorage values reset to `{ hasSeenPrompt: true, hasStartedTour: false }`
3. Tour restarts immediately from step 1
4. No prompt shown since user explicitly chose to retake

### State Management (TourContext)
```typescript
interface TourState {
  isActive: boolean           // Tour is currently running
  currentStep: number        // Current step index
  hasSeenPrompt: boolean     // User has seen the opt-in prompt
  hasStartedTour: boolean    // User has started the tour at least once
}
```
- State persisted to localStorage on every change
- TourProvider hydrates from localStorage on mount
- No complex state machine needed—just boolean flags and step tracking

## Tour Content & Internationalization

### Content Structure
Tour steps are organized into logical groups for internal organization, though users experience them as a continuous flow:

**Group 1: Getting Started** (2-3 steps)
- Welcome and purpose
- Overview of main workspace layout

**Group 2: Project Management** (2-3 steps)
- Opening USFM files from file browser
- Recent projects list
- Creating new projects

**Group 3: The Editor** (3-4 steps)
- USFM text editing area
- Paragraph markers (\p)
- Verse markers (\v)
- Toolbar functionality

**Group 4: Search & Navigation** (2-3 steps)
- Finding text in your document
- Replacing text
- Jumping to specific references

**Group 5: Saving & Exporting** (1-2 steps)
- Saving your work
- Exporting options

### Internationalization with @lingui
All tour content uses Lingui's `<Trans>` macro for translatable strings:

```tsx
import { Trans } from '@lingui/react/macro';

const workspaceSteps = [
  {
    target: '[data-testid="file-browser-button"]',
    content: <Trans>Open your USFM files here to begin editing scripture.</Trans>,
    disableBeacon: true,
  },
  // ... more steps
];
```

Benefits:
- Ready for multi-language support from day one
- Easy to add translations later without refactoring
- Maintains consistency with existing i18n patterns in the app
- Tour messages extracted to locale files alongside other app text

### Message Guidelines
- **Length**: 20-30 words maximum per step
- **Tone**: Helpful, educational, friendly
- **Language**: Simple, non-technical, avoid jargon
- **Focus**: One concept per step, clear action or observation

## Error Handling & Edge Cases

### Target Element Not Found
- **Scenario**: Tour step references a data-testid element that doesn't exist (UI changed, component removed, or conditional rendering)
- **Behavior**: Tour library detects missing target and automatically skips to next valid step
- **Fallback**: Log a warning in development mode, silently skip in production
- **Prevention**: TypeScript interface for tour config ensures all targets are defined; E2E tests verify tour can complete end-to-end

### Storage Access Issues
- **Scenario**: localStorage unavailable (privacy mode, storage quota exceeded, browser restrictions)
- **Behavior**: Graceful degradation—tour features disabled, app functions normally
- **Detection**: Wrap localStorage access in try-catch on app initialization
- **User impact**: First launch prompt may appear on every load, but app remains functional

### Window Resize & Viewport Issues
- **Scenario**: User resizes window or uses small viewport, tour tooltip position breaks
- **Behavior**: React Joyride automatically repositions tooltip to fit viewport
- **Edge case**: Element is scrolled off-screen → Joyride scrolls to bring element into view before showing tooltip
- **Mobile consideration**: On very small screens, consider showing tooltip in center overlay mode

### Tour Interruption
- **Scenario**: User navigates away from current route during active tour (e.g., clicks a menu item)
- **Behavior**: Tour library detects route change and automatically dismisses tour
- **User experience**: Clean dismissal, no prompts or partial state

### Component Loading States
- **Scenario**: Tour step targets a component that hasn't loaded yet (lazy-loaded route, async data fetching)
- **Behavior**: Joyride's `disableBeacon` flag prevents premature highlighting; `run={isTourActive}` ensures tour only starts when UI is ready
- **Safeguard**: Wrap tour start in useEffect that fires after critical components mount

## Testing Strategy

### Unit Tests
- **Tour configuration**: Verify each step has required fields (target, content, placement)
- **Tour state logic**: Test TourProvider state updates, localStorage integration
- **useTour hook**: Test startTour, stopTour, resetTour functions update state correctly
- **Storage utilities**: Test localStorage read/write with mock storage

### Integration Tests
- **First launch flow**: Simulate fresh install, verify prompt appears, test Yes/No paths
- **Restart from settings**: Verify settings button resets state and restarts tour
- **Tour completion**: Verify tour marks as started and dismisses cleanly
- **State persistence**: Verify localStorage values persist across component unmount/remount

### E2E Tests (Playwright - Web Only)
- **Full tour walkthrough**: Automate clicking through all 10-15 steps to completion
- **Skip functionality**: Verify "Skip Tour" button dismisses tour at any step
- **Settings restart**: Navigate to settings, click retake, verify tour restarts
- **Target validation**: Verify all data-testid and data-tourid targets exist and are visible

### Accessibility Testing
- **Keyboard navigation**: Verify tour can be navigated with Tab/Enter/Escape
- **Screen reader**: Verify tour tooltips announce properly with ARIA attributes
- **Focus management**: Verify focus moves to highlighted element appropriately

### Manual Testing Checklist
- First launch on fresh install (web)
- Skip tour immediately
- Complete full tour end-to-end
- Restart tour from settings multiple times
- Close app mid-tour, reopen and verify behavior

## Implementation Considerations & Notes

### Technical Debt & Maintenance
- Tour content is coupled to UI structure—when UI components change, tour targets may need updating. Maintain a checklist in the design doc or as code comments for areas that impact the tour.
- Add comment in component files with `data-tourid` attributes to document tour dependencies.

### Performance
- Tour library only loads when tour is active or could be active (after first launch check). Lazy load the tour provider if startup performance becomes a concern.
- Tour config is static and small—no performance impact from loading all step definitions upfront.

### Accessibility
- Ensure tour tooltips have proper ARIA attributes (handled by React Joyride)
- High contrast colors for tour highlights (verify with existing Mantine theme)
- Support keyboard navigation (arrow keys, Escape to dismiss) - Joyride provides this out of the box.

### Future Enhancements (Not in Initial Scope)
- Context-sensitive tours: Different tours for specific user scenarios (e.g., "Editing your first file" vs "Advanced features")
- Progress saving: Allow users to pause mid-tour and resume later (currently resets on restart)
- Analytics: Track tour completion rates to identify confusing steps
- Custom themes: Match tour appearance more closely to Dovetail branding beyond Joyride defaults

### Documentation
- Add inline comments in tourConfig.ts explaining how to add/edit steps
- Document data-tourid convention in developer guide (if one exists)
