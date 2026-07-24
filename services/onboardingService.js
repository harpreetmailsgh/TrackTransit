import * as FileSystem from 'expo-file-system/legacy';

const ONBOARDING_FILE = `${FileSystem.documentDirectory}onboarding-v1.json`;

async function readOnboardingRaw() {
  try {
    const info = await FileSystem.getInfoAsync(ONBOARDING_FILE);
    if (!info.exists) return { hasCompletedOnboarding: false };
    const json = await FileSystem.readAsStringAsync(ONBOARDING_FILE);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return { hasCompletedOnboarding: false };
    return parsed;
  } catch {
    return { hasCompletedOnboarding: false };
  }
}

async function writeOnboardingRaw(data) {
  try {
    await FileSystem.writeAsStringAsync(ONBOARDING_FILE, JSON.stringify(data));
  } catch (e) {
    console.log('[TransitScanner] onboardingService write failed:', e?.message);
  }
}

export async function getHasCompletedOnboarding() {
  const data = await readOnboardingRaw();
  return Boolean(data?.hasCompletedOnboarding);
}

export async function setOnboardingComplete() {
  await writeOnboardingRaw({ hasCompletedOnboarding: true, completedAt: Date.now() });
}

export async function resetOnboarding() {
  try {
    await FileSystem.deleteAsync(ONBOARDING_FILE, { idempotent: true });
  } catch {
    // ignore
  }
}
