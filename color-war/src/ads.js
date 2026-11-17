// 배너 광고: 아이폰 앱에서만 대결 화면 아래 비워 둔 칸(app.css #play 아래 64pt)에 띄운다.
// 웹·브라우저에서는 아무것도 하지 않는다. 플러그인: @capacitor-community/admob(번들러 없이 Capacitor 다리로 부른다).
// 순서: 동의(UMP, 유럽 등에서만 창이 뜸) → 추적 허용 창(ATT, 처음 한 번) → SDK 시작 → 대결 화면에서만 배너.
const cap = window.Capacitor;
const native = !!cap?.isNativePlatform?.();

// AdMob: 앱 ID ca-app-pub-6152195213210818~8258449645(Info.plist), 배너 단위 'Play screen banner'.
// 개발 중에는 Google 시험 배너를 쓴다(실제 단위를 개발 중에 누르면 무효 트래픽). 출시 빌드 직전에만 RELEASE = true.
const RELEASE = false;
export const AD = RELEASE
  ? { banner: 'ca-app-pub-6152195213210818/9220177523', testing: false }
  : { banner: 'ca-app-pub-3940256099942544/2934735716', testing: true };

const call = (method, opts = {}) => cap.nativePromise('AdMob', method, opts);
let ready = false, want = false, made = false, starting = null, onPrivacyOptions = null;

// 설정 화면이 "광고 개인정보 설정" 링크를 보이게 하는 함수를 넘긴다
export function whenPrivacyOptionsRequired(fn) { onPrivacyOptions = fn; }
export function showPrivacyOptions() { if (native) call('showPrivacyOptionsForm').catch((e) => console.warn('[ads] privacy', e?.message || e)); }

export function initAds() {
  if (!native || starting) return starting;
  starting = (async () => {
    try {
      let info = await call('requestConsentInfo', {});
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await call('showConsentForm');
      // 유럽 등 Google이 요구하는 곳에서는 설정에 "광고 개인정보 설정"을 보여 준다
      if (info.privacyOptionsRequirementStatus === 'REQUIRED') onPrivacyOptions?.();
      const t = await call('trackingAuthorizationStatus');
      if (t.status === 'notDetermined') await call('requestTrackingAuthorization');
      if (!info.canRequestAds) return;
      cap.nativeCallback('AdMob', 'addListener', { eventName: 'bannerAdSizeChanged' }, (s) => {
        // 비워 둔 칸(처음 64pt)을 실제 배너 높이에 맞춘다: 배너가 얇으면 판이 그만큼 커진다
        if (s?.height) { document.documentElement.style.setProperty('--ad', `${Math.ceil(s.height)}px`); dispatchEvent(new Event('resize')); } // 멈춤 단추 위치도 다시 맞춘다
      });
      await call('initialize', { initializeForTesting: AD.testing, maxAdContentRating: 'General' }); // 앱 연령 등급(4+)에 맞춰 일반 등급 광고만
      ready = true;
      if (want) await bannerOn();
    } catch (e) { console.warn('[ads]', e?.message || e); }
  })();
  return starting;
}

async function bannerOn() {
  if (!ready) return;
  try {
    if (made) await call('resumeBanner');
    else { made = true; await call('showBanner', { adId: AD.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: AD.testing }); }
  } catch (e) { made = false; console.warn('[ads] banner', e?.message || e); }
}

// 화면이 바뀔 때 부른다: 대결 화면이면 배너를 보이고, 아니면 숨긴다
export function adsForScreen(name) {
  if (!native) return;
  want = name === 'play';
  if (!ready) return;
  if (want) bannerOn(); else if (made) call('hideBanner').catch(() => {});
}
