# Implementation Plan: Onboarding Tour Feature

## Section 1: Project Setup & Dependencies

### 1.1 Install Tour Library
**Task**: Install react-joyride (or alternative popular tour library)

**Files to touch**:
- `package.json`

**Steps**:
1. Run: `pnpm add react-joyride`
2. Verify installation successful
3. Run `pnpm biome` to ensure formatting

**Testing**: No tests needed for dependency installation

**Notes**:
- react-joyride is well-maintained, actively developed (check latest version before installing)
- TypeScript support is built-in
- No additional peer dependencies beyond what's already in the project

**Dependencies**: None (prerequisite task)

---

### 1.2 Create Tour Directory Structure
**Task**: Set up the directory structure for tour-related files

**Files to create**:
- `src/app/ui/tour/TourProvider.tsx`
- `src/app/ui/tour/useTour.ts`
- `src/app/ui/tour/tourConfig.ts`
- `src/app/ui/tour/steps/index.ts`
- `src/app/ui/tour/steps/workspaceSteps.tsx`
- `src/app/ui/tour/steps/editorSteps.tsx`
- `src/app/ui/tour/steps/searchSteps.tsx`
- `src/app/ui/tour/steps/navigationSteps.tsx`
- `src/app/ui/tour/steps/exportSteps.tsx`

**Steps**:
1. Create directories with mkdir command
2. Create empty placeholder files to establish structure
3. Add basic file headers with purpose comments

**Testing**: No tests needed for file structure creation

**Dependencies**: None (can be done in parallel with 1.1)

---

### 2.7 Create Custom Types (Only for Tour-Specific Logic)
**Task**: Define types for localStorage state and tour context (not duplicating Joyride types)

**Files to touch**:
- `src/app/ui/tour/types.ts` (new file)

**Implementation**:
```typescript
// Joyride's state is managed by the library, we only need our custom state
export interface TourState {
  isActive: boolean;
  hasSeenPrompt: boolean;
  hasStartedTour: boolean;
}

export interface TourContextValue {
  state: TourState;
  startTour: () => void;
  stopTour: () => void;
  resetTour: () => void;
}

// localStorage state shape
export interface TourStorageState {
  hasSeenPrompt: boolean;
  hasStartedTour: boolean;
}
```

**Testing**:
- Unit test: Verify TypeScript types are correctly defined and exported

**Dependencies**: None (can be done in parallel with other tasks)

---

## Section 2: Tour Configuration & Content

### 2.1 Implement Tour Content - Getting Started Group
**Task**: Create the first group of tour steps for welcome and workspace overview

**Files to touch**:
- `src/app/ui/tour/steps/gettingStartedSteps.tsx` (create this new file)

**Implementation**:
```tsx
import { Trans } from '@lingui/react/macro';
import type { Step } from 'react-joyride';

export const gettingStartedSteps: Step[] = [
  {
    target: `[data-testid="${TESTING_IDS.onboarding.mainLayout}"]`,
    content: <Trans>Welcome to Dovetail! This is where you edit and manage your scripture files.</Trans>,
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.sidebar}"]`,
    content: <Trans>Use this sidebar to navigate between files and manage your workspace.</Trans>,
    placement: 'right',
    disableBeacon: false,
  },
];
```

**Testing**:
- Unit test: Verify array contains valid Step objects
- Unit test: Verify each step has required fields (target, content)
- E2E test: Verify steps can be displayed in browser

**Dependencies**: Task 1.2 (directory structure)

**Note**: Use `Step` type from `react-joyride` instead of custom TourStep interface

---

### 2.2 Implement Tour Content - Workspace Management Group
**Task**: Create tour steps for file operations and project management

**Files to touch**:
- `src/app/ui/tour/steps/workspaceSteps.tsx`

**Implementation**:
```tsx
import { Trans } from '@lingui/react/macro';
import type { Step } from 'react-joyride';

export const workspaceSteps: Step[] = [
  {
    target: `[data-testid="${TESTING_IDS.onboarding.fileBrowserButton}"]`,
    content: <Trans>Open your USFM files here to begin editing scripture.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.recentProjectsList}"]`,
    content: <Trans>Find and reopen your recent projects from this list.</Trans>,
    placement: 'right',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.newProjectButton}"]`,
    content: <Trans>Create a new project to start translating from scratch.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
];
```

**Testing**:
- Unit test: Verify array contains valid Step objects
- E2E test: Verify each target element exists in UI

**Dependencies**: Task 2.7, Task 2.1

---

### 2.3 Implement Tour Content - Editor Group
**Task**: Create tour steps for the USFM editor functionality

**Files to touch**:
- `src/app/ui/tour/steps/editorSteps.tsx`

**Implementation**:
```tsx
import { Trans } from '@lingui/react/macro';
import type { Step } from 'react-joyride';

export const editorSteps: Step[] = [
  {
    target: `[data-testid="${TESTING_IDS.onboarding.editorArea}"]`,
    content: <Trans>Type your scripture text here. Paragraph and verse markers are handled automatically.</Trans>,
    placement: 'top',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.toolbar}"]`,
    content: <Trans>Use these tools to insert chapter markers, headings, and other formatting.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.formattingPalette}"]`,
    content: <Trans>Quickly add common markers like paragraph breaks and verse numbers.</Trans>,
    placement: 'left',
    disableBeacon: false,
  },
];
```

**Testing**:
- Unit test: Verify array contains valid Step objects
- E2E test: Verify each target element exists in UI

**Dependencies**: Task 2.7, Task 2.2

---

### 2.4 Implement Tour Content - Search Group
**Task**: Create tour steps for search and navigation features

**Files to touch**:
- `src/app/ui/tour/steps/searchSteps.tsx`

**Implementation**:
```tsx
import { Trans } from '@lingui/react/macro';
import type { Step } from 'react-joyride';

export const searchSteps: Step[] = [
  {
    target: `[data-testid="${TESTING_IDS.onboarding.searchButton}"]`,
    content: <Trans>Find any word or phrase in your document with the search tool.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.replaceButton}"]`,
    content: <Trans>Replace text across your entire project or just the current chapter.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
];
```

**Testing**:
- Unit test: Verify array contains valid Step objects
- E2E test: Verify each target element exists in UI

**Dependencies**: Task 2.7, Task 2.3

---

### 2.5 Implement Tour Content - Export Group
**Task**: Create tour steps for saving and exporting

**Files to touch**:
- `src/app/ui/tour/steps/exportSteps.tsx`

**Implementation**:
```tsx
import { Trans } from '@lingui/react/macro';
import type { Step } from 'react-joyride';

export const exportSteps: Step[] = [
  {
    target: `[data-testid="${TESTING_IDS.onboarding.saveButton}"]`,
    content: <Trans>Save your work regularly to keep your changes safe.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
  {
    target: `[data-testid="${TESTING_IDS.onboarding.exportButton}"]`,
    content: <Trans>Export your finished scripture in different formats when you're ready.</Trans>,
    placement: 'bottom',
    disableBeacon: false,
  },
];
```

**Testing**:
- Unit test: Verify array contains valid Step objects
- E2E test: Verify each target element exists in UI

**Dependencies**: Task 2.7, Task 2.4

---

### 2.6 Create Central Tour Configuration
**Task**: Combine all step groups into a single exportable configuration

**Files to touch**:
- `src/app/ui/tour/tourConfig.ts`

**Implementation**:
```ts
import { gettingStartedSteps } from './steps/gettingStartedSteps';
import { workspaceSteps } from './steps/workspaceSteps';
import { editorSteps } from './steps/editorSteps';
import { searchSteps } from './steps/searchSteps';
import { exportSteps } from './steps/exportSteps';
import type { Step, Options } from 'react-joyride';

// Combine all steps into a flat array for the tour library
export const tourSteps: Step[] = [
  ...gettingStartedSteps,
  ...workspaceSteps,
  ...editorSteps,
  ...searchSteps,
  ...exportSteps,
];

// Export groups for reference (helpful for maintenance - uses Step[] type)
export const tourGroups = {
  gettingStarted: gettingStartedSteps,
  workspace: workspaceSteps,
  editor: editorSteps,
  search: searchSteps,
  export: exportSteps,
};

// Tour configuration object using Joyride's Options type
export const tourConfig: Partial<Options> = {
  steps: tourSteps,
  continuous: true,
  showSkipButton: true,
  showProgress: true,
  spotlightClicks: false,
  disableCloseOnEsc: false,
  disableOverlay: false,
  hideCloseButton: false,
  disableOverlayClose: false,
  scrollToFirstStep: true,
};
```

**Testing**:
- Unit test: Verify all step groups are properly merged
- Unit test: Verify total step count equals sum of all groups
- Unit test: Verify tourConfig conforms to Joyride's Options type

**Dependencies**: Tasks 2.1-2.5 (all step groups)

---

## Section 3: Tour Provider & State Management

### 3.1 Implement localStorage Storage Utilities
**Task**: Create utilities for reading/writing tour state to localStorage

**Files to touch**:
- `src/app/ui/tour/storage.ts` (new file)

**Implementation**:
```ts
const TOUR_STORAGE_KEY = 'dovetail-tour-status';

export interface TourStorageState {
  hasSeenPrompt: boolean;
  hasStartedTour: boolean;
}

const DEFAULT_STATE: TourStorageState = {
  hasSeenPrompt: false,
  hasStartedTour: false,
};

export function getTourState(): TourStorageState {
  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_STATE, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to read tour state from localStorage:', error);
  }
  return { ...DEFAULT_STATE };
}

export function setTourState(state: Partial<TourStorageState>): void {
  try {
    const current = getTourState();
    const updated = { ...current, ...state };
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to write tour state to localStorage:', error);
  }
}

export function resetTourState(): void {
  setTourState(DEFAULT_STATE);
}
```

**Testing**:
- Unit test: getTourState returns default state when localStorage is empty
- Unit test: getTourState merges stored values with defaults
- Unit test: setTourState updates only provided fields
- Unit test: resetTourState clears back to defaults
- Unit test: Gracefully handles localStorage access errors (try-catch)

**Dependencies**: Task 2.7 (types)

---

### 3.2 Create Tour Context
**Task**: Set up React context for tour state management

**Files to touch**:
- `src/app/ui/tour/TourContext.tsx` (new file)

**Implementation**:
```tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { TourContextValue, TourState } from './types';
import { getTourState, setTourState } from './storage';

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  // Hydrate initial state from localStorage
  const storageState = getTourState();

  const [state, setState] = useState<TourState>({
    isActive: false,
    hasSeenPrompt: storageState.hasSeenPrompt,
    hasStartedTour: storageState.hasStartedTour,
  });

  const startTour = useCallback(() => {
    setState(prev => ({ ...prev, isActive: true }));
    setTourState({ hasSeenPrompt: true, hasStartedTour: true });
  }, []);

  const stopTour = useCallback(() => {
    setState(prev => ({ ...prev, isActive: false }));
  }, []);

  const resetTour = useCallback(() => {
    setState(prev => ({ ...prev, isActive: true, hasStartedTour: false }));
    setTourState({ hasSeenPrompt: true, hasStartedTour: false });
  }, []);

  const value: TourContextValue = {
    state,
    startTour,
    stopTour,
    resetTour,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}
```

**Testing**:
- Integration test: Provider renders children correctly
- Integration test: startTour updates state and localStorage
- Integration test: stopTour only updates isActive
- Integration test: resetTour updates all state correctly
- Integration test: State hydrates from localStorage on mount
- Integration test: useTour throws error outside provider

**Dependencies**: Tasks 2.7, 3.1

---

### 3.3 Implement Joyride Tour Component Wrapper
**Task**: Create the actual tour component that integrates React Joyride with our state

**Files to touch**:
- `src/app/ui/tour/Tour.tsx` (new file)

**Implementation**:
```tsx
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useTour } from './TourContext';
import { tourConfig } from './tourConfig';

export function Tour() {
  const { state, stopTour } = useTour();

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopTour();
    }
  };

  return (
    <Joyride
      {...tourConfig}
      run={state.isActive}
      callback={handleJoyrideCallback}
    />
  );
}
```

**Testing**:
- Integration test: Tour renders when state.isActive is true
- Integration test: Tour doesn't render when state.isActive is false
- Integration test: Joyride component receives correct props from tourConfig
- Integration test: stopTour is called when Joyride callback receives STATUS.FINISHED
- Integration test: stopTour is called when Joyride callback receives STATUS.SKIPPED
- Integration test: Tour doesn't crash when Joyride callback receives other statuses
- E2E test: Full tour completes and dismisses
- E2E test: Skip button dismisses tour

**Dependencies**: Tasks 3.2, 2.6 (tourConfig)

---

### 3.4 Create useTour Hook (Export Wrapper)
**Task**: Export the useTour hook for easy access throughout the app

**Files to touch**:
- `src/app/ui/tour/index.ts` (new file)

**Implementation**:
```ts
export { TourProvider, useTour } from './TourContext';
export { Tour } from './Tour';
export { tourConfig, tourSteps } from './tourConfig';
export * from './types';
```

**Testing**: No tests needed for re-exports

**Dependencies**: Tasks 3.2, 3.3

---

## Section 4: App Integration

### 4.1 Wrap App with TourProvider
**Task**: Integrate TourProvider into the app's component tree

**Files to touch**:
- `src/app/App.tsx` (or equivalent root component)

**Implementation**:
1. Import TourProvider from tour module
2. Wrap the entire app (or as high as needed) with TourProvider
3. Ensure it's above any components that need to use useTour

Example:
```tsx
import { TourProvider } from './ui/tour';
// ... other imports

function App() {
  return (
    <TourProvider>
      {/* existing app structure */}
      {/* ... existing providers and routes */}
    </TourProvider>
  );
}
```

**Testing**:
- Integration test: App renders with TourProvider wrapper
- Integration test: Components can access useTour hook without errors
- Integration test: Tour state persists across app renders

**Dependencies**: Task 3.4 (tour exports)

**Note**: Need to check actual App.tsx structure to determine optimal placement

---

### 4.2 Create FirstLaunchPrompt Component
**Task**: Create a modal that appears on first launch to prompt users about the tour

**Files to touch**:
- `src/app/ui/tour/FirstLaunchPrompt.tsx` (new file)

**Implementation**:
```tsx
import { useTour } from './TourContext';
import { Modal, Button, Title, Text } from '@mantine/core';

export function FirstLaunchPrompt() {
  const { state, startTour } = useTour();

  if (state.hasSeenPrompt) {
    return null;
  }

  return (
    <Modal
      opened={!state.hasSeenPrompt}
      onClose={() => {}}
      withCloseButton={false}
      centered
      size="md"
    >
      <Title order={3}>Welcome to Dovetail!</Title>
      <Text mt="sm">
        Would you like a guided tour of the main features?
      </Text>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
        <Button variant="default" onClick={() => startTour()}>
          Yes, show me around
        </Button>
        <Button variant="subtle" onClick={() => startTour()}>
          No thanks
        </Button>
      </div>
    </Modal>
  );
}
```

**Testing**:
- Integration test: Modal shows when hasSeenPrompt is false
- Integration test: Modal doesn't show when hasSeenPrompt is true
- Integration test: Both Yes and No buttons call startTour
- Integration test: Clicking either button sets hasSeenPrompt to true
- E2E test: Modal appears on fresh install
- E2E test: User can interact with both buttons

**Dependencies**: Tasks 3.4, 4.1

---

### 4.3 Render Tour and FirstLaunchPrompt in App
**Task**: Add Tour and FirstLaunchPrompt components to the main app layout

**Files to touch**:
- `src/app/App.tsx` (or equivalent root component)

**Implementation**:
1. Import Tour and FirstLaunchPrompt from tour module
2. Render both components at the top level of the app

Example:
```tsx
import { Tour, TourProvider } from './ui/tour';
import { FirstLaunchPrompt } from './ui/tour/FirstLaunchPrompt';
// ... other imports

function App() {
  return (
    <TourProvider>
      <FirstLaunchPrompt />
      <Tour />
      {/* existing app structure */}
    </TourProvider>
  );
}
```

**Testing**:
- Integration test: Both components render without errors
- Integration test: Tour doesn't interfere with existing app functionality
- E2E test: App loads and functions normally with tour components present

**Dependencies**: Tasks 3.3, 3.4, 4.1, 4.2

---

### 4.4 Add "Retake Tour" Button to Settings
**Task**: Create a button in the settings page that allows users to restart the tour

**Files to touch**:
- `src/app/routes/settings.tsx` (or equivalent settings route)

**Implementation**:
1. Import useTour hook
2. Add a button that calls resetTour
3. Style it to match existing settings buttons

Example:
```tsx
import { useTour } from '../ui/tour';
// ... other imports

export function Route() {
  const { resetTour } = useTour();

  return (
    <div>
      {/* existing settings content */}

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ddd' }}>
        <h3>Help & Learning</h3>
        <p>Learn how to use Dovetail's features.</p>
        <Button onClick={resetTour}>
          Retake Tour
        </Button>
      </div>
    </div>
  );
}
```

**Testing**:
- Integration test: Reset tour button calls resetTour
- Integration test: Tour starts after clicking button
- E2E test: User can navigate to settings and restart tour
- E2E test: Tour restarts from beginning after clicking button

**Dependencies**: Tasks 3.4, 4.1

**Note**: Need to check actual settings.tsx structure and styling conventions

---

### 4.5 Verify and Add data-tourid Attributes (If Needed)
**Task**: Audit existing UI components and add data-tourid attributes for elements without data-testid

**Files to touch**:
- Varies - any UI components that need tour targeting but lack data-testid

**Implementation**:
1. Review tourConfig.ts to see all target selectors
2. For each target, check if the corresponding element has data-testid
3. If not, add data-tourid attribute to the component
4. Update tour step target to use data-tourid instead

Example:
```tsx
// Before: No test ID
<button onClick={handleOpen}>Open File</button>

// After: Add tour ID
<button data-tourid="file-browser-button" onClick={handleOpen}>Open File</button>
```

Then update tourConfig:
```ts
// Update target
target: '[data-tourid="file-browser-button"]',
```

**Testing**:
- E2E test: Each tour step can find its target element
- E2E test: Full tour completes without missing targets

**Dependencies**: Tasks 2.1-2.6 (tour content), 4.3 (integration)

**Note**: This is an iterative task - may need to add data-tourid to multiple files. Most elements should already have data-testid for E2E tests.

---

## Section 5: Testing Implementation

### 5.1 Unit Tests - Storage Utilities
**Task**: Write comprehensive unit tests for localStorage utilities

**Files to touch**:
- `src/test/unit/tour/storage.test.ts` (new file)

**Implementation**:
Test cases:
1. getTourState returns default state when localStorage is empty
2. getTourState merges stored values with defaults
3. setTourState updates only provided fields, preserves others
4. setTourState handles partial updates correctly
5. resetTourState clears all values back to defaults
6. Gracefully handles localStorage.setItem errors (try-catch)
7. Gracefully handles localStorage.getItem errors (try-catch)
8. Handles malformed JSON in localStorage

**Setup**: Use vi.stubGlobal('localStorage', mockStorage) from Vitest

**Dependencies**: Task 3.1 (storage utilities)

---

### 5.2 Unit Tests - TourContext
**Task**: Write unit tests for TourProvider and useTour hook

**Files to touch**:
- `src/test/unit/tour/TourContext.test.tsx` (new file)

**Implementation**:
Test cases:
1. TourProvider renders children without errors
2. TourProvider hydrates initial state from localStorage
3. startTour updates isActive to true
4. startTour calls setTourState with correct values
5. stopTour updates isActive to false
6. stopTour does not modify localStorage
7. resetTour updates isActive to true and hasStartedTour to false
8. resetTour updates localStorage correctly
9. State persists across component re-renders
10. useTour throws error when used outside TourProvider

**Setup**: Use @testing-library/react for rendering and act for state updates

**Dependencies**: Tasks 3.1, 3.2

---

### 5.3 Unit Tests - Tour Component
**Task**: Write unit tests for the Tour component wrapper

**Files to touch**:
- `src/test/unit/tour/Tour.test.tsx` (new file)

**Implementation**:
Test cases:
1. Tour renders when state.isActive is true
2. Tour doesn't render when state.isActive is false
3. Joyride component receives correct props from tourConfig
4. stopTour is called when Joyride callback receives STATUS.FINISHED
5. stopTour is called when Joyride callback receives STATUS.SKIPPED
6. Tour doesn't crash when Joyride callback receives other statuses

**Setup**: Mock react-joyride, use @testing-library/react

**Dependencies**: Tasks 3.2, 3.3

---

### 5.4 Unit Tests - FirstLaunchPrompt
**Task**: Write unit tests for the first launch modal

**Files to touch**:
- `src/test/unit/tour/FirstLaunchPrompt.test.tsx` (new file)

**Implementation**:
Test cases:
1. Modal is visible when hasSeenPrompt is false
2. Modal is hidden when hasSeenPrompt is true
3. "Yes" button calls startTour
4. "No" button calls startTour
5. Clicking either button sets hasSeenPrompt to true
6. Modal content renders correctly with expected text
7. Modal has no close button (withCloseButton={false})

**Setup**: Use @testing-library/react with Mantine theme provider

**Dependencies**: Tasks 3.2, 4.2

---

### 5.5 Unit Tests - Tour Configuration
**Task**: Write unit tests for tour configuration structure

**Files to touch**:
- `src/test/unit/tour/tourConfig.test.ts` (new file)

**Implementation**:
Test cases:
1. tourSteps array is not empty
2. Each step in tourSteps has required fields (target, content)
3. All step groups are exported correctly
4. tourSteps is the concatenation of all step groups
5. Total step count equals sum of all group lengths
6. tourConfig has expected Joyride options
7. tourConfig conforms to Joyride's Options type (TypeScript)
8. All target selectors are valid CSS selector strings

**Dependencies**: Tasks 2.1-2.6

---

### 5.6 Integration Tests - End-to-End Tour Flow
**Task**: Write integration tests for the complete tour user flow

**Files to touch**:
- `src/test/integration/tour/tourFlow.test.tsx` (new file)

**Implementation**:
Test cases:
1. First launch shows modal, clicking "Yes" starts tour
2. First launch shows modal, clicking "No" dismisses without tour
3. Tour progresses through all steps
4. Skip button dismisses tour at any step
5. Tour completes and dismisses on final step
6. Settings "Retake Tour" button restarts tour
7. State persists across page refreshes (localStorage)
8. Tour doesn't show prompt after first launch

**Setup**: Use @testing-library/react with full app component tree

**Dependencies**: Tasks 4.1-4.4

---

### 5.7 E2E Tests - Playwright
**Task**: Write end-to-end tests using Playwright

**Files to touch**:
- `src/test/e2e/tour.spec.ts` (new file)

**Implementation**:
Test cases:
1. Full tour walkthrough - click through all steps to completion
2. Skip functionality - verify "Skip Tour" button dismisses tour at step 3
3. Settings restart - navigate to settings, click retake, verify tour restarts
4. Target validation - verify all data-testid and data-tourid targets exist
5. First launch flow - fresh install shows modal, both buttons work
6. No prompt on subsequent launches - refresh page, confirm no modal

**Setup**: Use Playwright with existing test infrastructure

**Selectors**: Use data-testid and data-tourid attributes for reliable element selection

**Dependencies**: All previous tasks (requires full integration)

**Note**: E2E tests should be run after all unit and integration tests pass

---

### 5.8 Run All Tests and Fix Issues
**Task**: Execute full test suite and address any failures

**Files to touch**:
- Varies based on test failures

**Implementation**:
1. Run unit tests: `pnpm test:unit`
2. Run integration tests: `pnpm test:integration`
3. Run E2E tests: `pnpm test.e2e`
4. Review and fix any failing tests
5. Ensure 100% pass rate before moving to next phase

**Dependencies**: All previous test tasks (5.1-5.7)
