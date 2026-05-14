# TrackTransit Build & Deployment Guide

## Version: 1.0.0
**Release Date:** May 2, 2026

---

## Pre-Build Checklist

- [x] app.json configured with version 1.0.0, buildNumber (iOS), versionCode (Android)
- [x] All permissions documented (iOS: NSLocationWhenInUseUsageDescription, NSUserNotificationsUsageDescription, etc.)
- [x] Privacy Policy created and ready for hosting
- [x] Metadata prepared for App Store and Play Store
- [x] eas.json configured for builds
- [x] All screens tested and working
- [x] Syntax validation passed (Babel parser)

---

## Step 1: EAS Build Configuration

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### Build for Preview (APK/IPA testing)
```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

### Build for Production (Play Store/App Store submission)
```bash
# Android (creates AAB for Play Store)
eas build --platform android --profile production

# iOS (creates archive for TestFlight/App Store)
eas build --platform ios --profile production
```

---

## Step 2: Set Up Credentials

### iOS App Store Connect
1. Create Apple Developer account if needed
2. Create App ID in Apple Developer Portal
3. Generate certificates and provisioning profiles
4. In `eas.json`, add Apple ID and ASC API key details

### Google Play Store
1. Create Google Play Developer account
2. Create app in Google Play Console
3. Create service account JSON for API access
4. In `eas.json`, add Android service account path

---

## Step 3: Privacy Policy Hosting

The file `store-metadata/privacy-policy.html` should be hosted at:
```
https://tracktransit.app/privacy
```

**Current Placeholder:** Update `app.json` privacy URLs when hosting is available:
```json
"infoPlist": {
  "NSUserNotificationsUsageDescription": "...",
  "NSPrivacyPolicyURL": "https://tracktransit.app/privacy"
}
```

---

## Step 4: App Store Submission (iOS)

1. **Create App Record** in App Store Connect
2. **Upload Build** from TestFlight
3. **Fill App Information:**
   - Use metadata from `store-metadata/app-store-metadata.md`
   - Add screenshots (minimum 5 per device type)
   - Add app preview video (optional for v1)
   - Select category: **Navigation**
   - Age rating: **4+**

4. **Version Release Information:**
   - What's New: "Initial release of TrackTransit - Real-time GO Transit tracking"
   - Keywords: transit, GO Transit, Toronto, GTA, real-time, tracking, delays

5. **Submit for Review**
   - Expected review time: 24-48 hours
   - Follow Apple's App Store Review Guidelines

---

## Step 5: Play Store Submission (Android)

1. **Create App Record** in Google Play Console
2. **Upload Build** (AAB file from EAS)
3. **Fill App Information:**
   - Use metadata from `store-metadata/play-store-metadata.md`
   - Add screenshots (8 recommended, 2-8 devices)
   - Add promo graphic (1024x500)
   - Add feature graphic (1920x1080)
   - Select category: **Maps & Navigation**

4. **Content Rating:**
   - Fill out IARC questionnaire: Everyone/General Audiences
   - Confirm no restricted content

5. **Pricing & Distribution:**
   - Free app
   - Select countries/regions for availability
   - Enable Google Play Instant (optional)

6. **Release:**
   - Start with **Closed Testing** first (internal testers)
   - Then move to **Open Testing** (public beta)
   - Finally, promote to **Production**

---

## Step 6: Real Device Testing

### Test on Physical Devices Before Store Submission

#### iOS (via TestFlight)
```bash
eas build --platform ios --profile production
# Download from TestFlight URL after build completes
```

**Devices to Test:**
- iPhone 12 (home devices/maps)
- iPhone 14 Pro (latest generation)
- iPad Air (tablet support)

**Test Scenarios:**
1. First launch → onboarding screen
2. Allow location permission
3. Navigate to Stops tab → search for a route
4. Save a trip → verify it appears in Saved tab
5. Open Trip Detail → verify all fields display
6. Disable location → app still works
7. Search functionality → verify filtering
8. Clear All button on Saved screen

#### Android (via Google Play Internal Testing)
```bash
eas build --platform android --profile production
# Upload to Google Play Console internal testing
```

**Devices to Test:**
- Samsung Galaxy S21+ (OLED display)
- Google Pixel 6 (stock Android)
- OnePlus 11 (OxygenOS)

**Additional Android Tests:**
1. Adaptive icon displays correctly
2. Edge-to-edge rendering
3. Notification permission flow
4. Background location access
5. System permissions dialogs

---

## Step 7: Monitor Store Reviews & Crashes

### Post-Launch Monitoring
1. Check daily reviews for issues
2. Monitor crash reports in:
   - App Store Connect (Crashes tab)
   - Google Play Console (Vitals section)
3. Respond to user feedback/questions
4. Plan v1.0.1 hotfix if critical issues found

---

## Version History

**v1.0.0** (May 2026)
- Initial launch
- Real-time GO Transit tracking
- Route search and saving
- Trip details with delays
- Onboarding flow
- Location permissions
- Notification infrastructure (UI hidden for v2)

**Planned v2.0.0**
- Backend server integration
- Active delay notifications
- User accounts & sync
- Cross-device saved routes
- Anonymized analytics

---

## Support & Contact

**Email:** support@tracktransit.app
**Website:** https://tracktransit.app
**Privacy Policy:** https://tracktransit.app/privacy

---

## Post-Build Checklist

- [ ] Production iOS build complete and uploaded to TestFlight
- [ ] Production Android build complete and uploaded to Play Console
- [ ] Internal testing on real iOS devices (3+ devices)
- [ ] Internal testing on real Android devices (3+ devices)
- [ ] All critical bugs fixed
- [ ] Privacy policy hosted at public URL
- [ ] App Store record created with all metadata
- [ ] Play Store record created with all metadata
- [ ] Screenshots added to both stores
- [ ] Submitted for review on both platforms
- [ ] Review process monitoring plan established
