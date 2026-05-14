# TrackTransit v1.0.0 - QA Test Plan

## Test Execution Environment
- **Version:** 1.0.0
- **Build Type:** Production
- **Platforms:** iOS (13+), Android (8+)
- **Test Date:** _______________
- **Tester:** _______________

---

## Onboarding Flow

### Screen: Onboarding.jsx
- [ ] App launches to onboarding screen on first run
- [ ] Animated feature cards display correctly
- [ ] "Continue" button is clickable
- [ ] Onboarding completion persists (doesn't re-show on relaunch)
- [ ] Feature descriptions are readable
- [ ] No crashes or errors during transitions
- [ ] Enable Notifications button works (shows alert)
- [ ] Skip Notifications button works
- [ ] Notification permission prompt appears on iOS (if clicked)

---

## Home/Map Screen (Stops Tab - index.jsx)

### Screen Layout
- [ ] SleekHeaderBar displays "Stops" with icon
- [ ] Map loads and displays correctly
- [ ] Current location indicator shows (if location allowed)
- [ ] Bottom sheet with stops list is visible
- [ ] Stops list shows multiple transit stops

### Location & Map Interaction
- [ ] Location permission request appears on first load
- [ ] Map centers on user location after permission
- [ ] Deny location permission → app still works (map shows GO Center)
- [ ] Tap on stop in list → bottom sheet updates
- [ ] Tap on map marker → shows stop details
- [ ] Search bar in bottom sheet filters stops

### Stops List
- [ ] Shows stop name, stop code, distance
- [ ] Tap on stop → opens Trip Details screen or departures list
- [ ] Scrolling through list is smooth
- [ ] No layout overflow or text truncation

---

## Search Screen (search.jsx)

### Initial State
- [ ] Header displays "Search" with icon
- [ ] Mode selector buttons visible (Bus/Train/All)
- [ ] Input field is focused by default
- [ ] "Clear" button appears after typing
- [ ] Mode selection is sticky across searches

### Search Functionality
- [ ] Type stop name → results appear
- [ ] Type stop code → results appear
- [ ] Type route number → results appear
- [ ] Filters by mode (Bus/Train/All) work correctly
- [ ] Results display stop names, codes, distances
- [ ] Tap result → opens Trip Details

### Edge Cases
- [ ] Search with no results → shows "No stops found" message
- [ ] Empty search → shows initial guidance
- [ ] Rapid mode switching doesn't crash
- [ ] Clearing search resets list
- [ ] Scrolling results is smooth

---

## Departures Screen (departures.jsx)

### Screen Layout
- [ ] Header shows "Departures" with stop name
- [ ] Route filter available
- [ ] Departure list displays correctly
- [ ] Each departure shows: time, route, destination, delay status

### Delay Information
- [ ] Live delay badge shows correctly (On Time/Delayed/Unknown)
- [ ] Delay minutes display accurately
- [ ] Status colors match design (green/red/gray)

### Interactions
- [ ] Tap on departure → opens Trip Details
- [ ] Pull-to-refresh works (if implemented)
- [ ] Route filter changes update list
- [ ] Scrolling is smooth with many departures
- [ ] Handles when no departures available

---

## Trip Details Screen (trip-detail.jsx)

### Core Information Display
- [ ] Trip header shows departure and arrival times
- [ ] From/To stops display clearly
- [ ] Route and line name visible
- [ ] Live delay status shows
- [ ] Duration and stop count display
- [ ] Platform code displays (if available)

### Actions
- [ ] Save button works → adds trip to Saved screen
- [ ] Saved button state changes (bookmark filled)
- [ ] Remove button works (if trip is already saved)
- [ ] Actions are responsive to taps

### Layout & Content
- [ ] All text is readable without truncation
- [ ] Icons render correctly
- [ ] Spacing and padding are appropriate
- [ ] No horizontal scroll needed
- [ ] Works in both portrait and landscape

---

## Saved Trips Screen (saved.jsx)

### Screen Layout
- [ ] Header displays "Saved" with icon
- [ ] Header offset is correct (no content hidden under header)
- [ ] Clear All button visible (when trips exist)

### Saved Trips Display
- [ ] Each saved trip shows as a card
- [ ] Trip information displays: from/to, times, route
- [ ] Live delay status shows correctly
- [ ] Trip cards are tappable

### Empty State
- [ ] When no trips saved → shows empty state message
- [ ] Clear All button hidden when no trips
- [ ] Empty state is visually clear

### Interactions
- [ ] Tap trip card → opens Trip Details
- [ ] Clear All button → shows confirmation dialog
- [ ] Confirm Clear All → removes all trips
- [ ] Cancel Clear All → keeps trips
- [ ] Delete individual trip → removes it from list

### Persistence
- [ ] Saved trips persist after app close/reopen
- [ ] Saved trips persist after phone restart
- [ ] Deleting trip is immediate

---

## Data & Services

### GO Transit Data Integration
- [ ] Trip data loads from GTFS service
- [ ] Real-time delays load from gtfsRealtimeService
- [ ] No trips display stale data
- [ ] API errors don't crash the app

### Permissions (iOS & Android)
- [ ] Location permission prompts appear correctly
- [ ] Denying location → app still functional
- [ ] Notification permission available in onboarding
- [ ] Permission dialogs use correct language

### Notifications Service
- [ ] Service initializes on app startup
- [ ] No errors in notification setup
- [ ] Token retrieval doesn't crash app
- [ ] Local notification capability is available (for v2)

---

## General / Cross-Platform

### Performance
- [ ] App starts in < 3 seconds
- [ ] Navigation between screens is smooth (no lag)
- [ ] List scrolling maintains 60 FPS
- [ ] No memory leaks over 10 minute session
- [ ] Background mode doesn't crash app

### UI/UX
- [ ] Brand color (GO_GREEN #00853F) used consistently
- [ ] Text hierarchy is clear
- [ ] Buttons are easily tappable (48px+ height)
- [ ] Status/error messages are user-friendly
- [ ] Loading states display appropriately

### Errors & Edge Cases
- [ ] No network → shows error gracefully
- [ ] Location permission denied → app works
- [ ] Corrupted saved trip data → app handles it
- [ ] Very long trip descriptions → no text overflow
- [ ] Many saved trips (100+) → performance acceptable

### Accessibility (iOS & Android)
- [ ] Screen reader reads all text elements
- [ ] Buttons are keyboard navigable
- [ ] Color contrast meets WCAG AA standards
- [ ] Touch targets are 44x44 minimum

---

## Platform-Specific Tests

### iOS Specific
- [ ] Runs on iOS 13+
- [ ] Safe area respected (notch, home indicator)
- [ ] Status bar color is correct
- [ ] App uses correct icon (from assets/icon.png)
- [ ] Splash screen displays during launch
- [ ] Location permission uses specified message
- [ ] Notification permission uses specified message
- [ ] Background location mode (if enabled) works

### Android Specific
- [ ] Runs on Android 8+
- [ ] Adaptive icon displays correctly
- [ ] Edge-to-edge layout respected
- [ ] Status bar text color appropriate
- [ ] Navigation bar interactions work
- [ ] Permission dialogs display with correct language
- [ ] Notifications initialize without errors
- [ ] Background location service works

---

## Final Sign-Off

### Pre-Release Quality Check
- [ ] All critical functionality tested
- [ ] No crashes or force closes
- [ ] Performance is acceptable
- [ ] UI is polished and professional
- [ ] All permissions working correctly
- [ ] Data persists correctly

### Release Ready?
- **YES** ☐ — Ready for store submission
- **NO** ☐ — Issues found, see notes below

### Issues Found (if any):
```
Issue 1: [Description]
Severity: [Critical/High/Medium/Low]
Status: [Open/In Progress/Fixed/Deferred]

Issue 2: [Description]
Severity: [Critical/High/Medium/Low]
Status: [Open/In Progress/Fixed/Deferred]
```

### Sign-Off
- Tester Name: _______________
- Date: _______________
- Signature: _______________

---

## Post-Launch Support

### Monitoring After Release
- [ ] Monitor App Store reviews for crashes
- [ ] Monitor Google Play Store reviews
- [ ] Check crash reports daily for first week
- [ ] Respond to user feedback
- [ ] Plan v1.0.1 hotfix if needed

### Known Limitations in v1.0.0
- Delay notifications UI is hidden (infrastructure ready for v2)
- No user accounts or cloud sync
- No cross-device saved route backup
- Notifications require backend server (planned for v2)
