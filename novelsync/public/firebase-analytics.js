import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAnalytics, isSupported, logEvent, setAnalyticsCollectionEnabled } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js';

const firebaseConfig = {
  apiKey: 'AIzaSyADkoa3yUE2ORqk16G-ZX-sKY1B4n8EYPQ',
  authDomain: 'novelsync-3ddb0.firebaseapp.com',
  projectId: 'novelsync-3ddb0',
  storageBucket: 'novelsync-3ddb0.firebasestorage.app',
  messagingSenderId: '246398817415',
  appId: '1:246398817415:web:64c9eaa49c0cf66e6c1422',
  measurementId: 'G-MGGSJK5BF9',
};

const allowedEvents = new Set(['book_opened', 'playback_started', 'feature_interaction']);
const allowedFeatureAreas = new Set([
  'playback',
  'reader_tools',
  'upload',
  'library',
  'chapter_navigation',
  'voice_settings',
  'dialogue_review',
  'reading_view',
  'navigation',
]);

export async function initializeNovelSyncAnalytics() {
  if (!(await isSupported())) return null;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);

  return {
    setCollectionEnabled(enabled) {
      setAnalyticsCollectionEnabled(analytics, enabled);
    },
    logEvent(eventName, parameters = {}) {
      if (!allowedEvents.has(eventName)) return;

      const safeParameters = eventName === 'book_opened'
        ? { source: parameters.source === 'upload' ? 'upload' : 'library' }
        : eventName === 'feature_interaction' && allowedFeatureAreas.has(parameters.feature_area)
          ? { feature_area: parameters.feature_area }
          : {};
      logEvent(analytics, eventName, safeParameters);
    },
  };
}

window.novelSyncFirebaseAnalytics = { initializeNovelSyncAnalytics };
