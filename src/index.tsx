import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Capacitor 환경 감지 및 조건부 Service Worker 등록
const isCapacitorEnvironment = () => {
  // Capacitor 환경 감지 방법들
  return !!(
    (window as any).Capacitor || 
    (window as any).capacitor ||
    // 추가적인 Capacitor 환경 감지
    document.URL.includes('capacitor://') ||
    document.URL.includes('ionic://') ||
    // 안드로이드 앱 환경
    (window as any).AndroidBridge ||
    // 기타 하이브리드 앱 환경
    (window as any).cordova
  );
};

// Service Worker 등록 결정
if (isCapacitorEnvironment()) {
  console.log('🔋 Capacitor 환경 감지됨 - Service Worker 비활성화');
  // Capacitor 환경에서는 Service Worker를 등록하지 않음
  // 대신 기본적인 오프라인 캐싱은 Capacitor가 담당
} else {
  console.log('🌐 웹 브라우저 환경 - Service Worker 활성화');
  // PWA 기능을 사용하려면 register()를 호출하세요.
  // 웹 브라우저 환경에서만 Service Worker 등록
  serviceWorkerRegistration.register();
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
