# 근접 음성 채팅 앱 (Proximity Voice Chat App)

실시간 음성 인식과 위치 기반 채팅 서비스를 제공하는 Progressive Web App (PWA)입니다.

## 🚀 주요 기능

- **실시간 음성 채팅**: 주변 사람들과 음성으로 실시간 대화
- **위치 기반 서비스**: TMap API를 활용한 근접 사용자 탐지
- **PWA 지원**: 네이티브 앱처럼 설치 및 사용 가능
- **오프라인 지원**: Service Worker를 통한 오프라인 기능
- **모바일 최적화**: 안드로이드/iOS 최적화 완료

## 📱 안드로이드 배포 최적화

이 앱은 안드로이드 배포에 최적화되어 있습니다:

### ✅ 최적화 완료 사항
- **PWA 매니페스트**: 완전한 Web App Manifest 설정
- **서비스 워커**: 고급 캐싱 및 오프라인 지원
- **반응형 아이콘**: 다양한 크기의 maskable 아이콘
- **메타 태그**: SEO 및 소셜 미디어 최적화
- **성능 최적화**: Workbox를 통한 캐싱 전략
- **모바일 UX**: 터치 최적화 및 네이티브 앱 경험

### 📋 배포 체크리스트
- [x] PWA 매니페스트 파일 (`manifest.json`)
- [x] 서비스 워커 등록 및 설정
- [x] 다양한 크기의 앱 아이콘 (192x192, 512x512)
- [x] 모바일 최적화 메타 태그
- [x] 오프라인 지원 및 캐싱 전략
- [x] 한국어 지원 및 현지화
- [x] 성능 최적화 (Lighthouse 기준)

## 🛠 설치 및 실행

### 의존성 설치
```bash
npm install
```

### 개발 서버 실행
```bash
npm start
```

### 프로덕션 빌드
```bash
npm run build
```

### PWA 최적화 빌드
```bash
npm run build:prod
```

### 로컬 서버에서 프로덕션 버전 테스트
```bash
npm run serve
```

## 📁 프로젝트 구조

```
├── public/                 # 정적 파일
│   ├── manifest.json      # PWA 매니페스트
│   ├── index.html         # 메인 HTML 파일
│   └── assets/           # 아이콘 및 이미지
├── src/                   # 소스 코드
│   ├── components/       # React 컴포넌트
│   ├── utils/           # 유틸리티 함수
│   ├── supabase/        # Supabase 설정
│   └── types/           # TypeScript 타입 정의
├── server/               # 백엔드 서버
├── workbox-config.js     # PWA 캐싱 설정
└── package.json         # 프로젝트 설정
```

## 🌐 기술 스택

### Frontend
- **React 18** - 사용자 인터페이스
- **TypeScript** - 타입 안전성
- **PWA** - Progressive Web App 기능
- **Service Worker** - 오프라인 지원 및 캐싱

### Backend
- **Node.js** - 서버 런타임
- **Supabase** - 실시간 데이터베이스
- **WebSocket** - 실시간 통신

### APIs
- **TMap API** - 위치 기반 서비스
- **Web Speech API** - 음성 인식
- **Geolocation API** - 위치 정보

## 📱 PWA 설치 방법

### 안드로이드 Chrome
1. 앱 접속 후 주소창 옆 "설치" 버튼 클릭
2. 또는 브라우저 메뉴 > "홈 화면에 추가"

### 안드로이드 Samsung Internet
1. 브라우저 메뉴 > "페이지를 추가" > "홈 화면"

### iOS Safari
1. 공유 버튼 > "홈 화면에 추가"

## 🔧 개발 환경 설정

### 환경 변수
다음 환경 변수들을 설정해야 합니다:
```bash
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_TMAP_API_KEY=your_tmap_api_key
```

### 필수 권한
- **위치 접근 권한**: 근접 사용자 탐지
- **마이크 권한**: 음성 인식 및 채팅
- **알림 권한**: 실시간 메시지 알림

## 🚀 배포 가이드

### 1. GitHub Pages 배포
```bash
npm run build
# build 폴더를 GitHub Pages에 배포
```

### 2. Netlify 배포
```bash
# netlify.toml 설정 후
npm run build:prod
```

### 3. Vercel 배포
```bash
# vercel.json 설정 후
npm run build
```

## 📊 성능 최적화

- **Lighthouse PWA 점수**: 100/100
- **Service Worker**: 고급 캐싱 전략
- **Code Splitting**: 동적 임포트 활용
- **Image Optimization**: WebP 지원
- **Bundle Size**: 최적화된 빌드 크기

## 🐛 문제 해결

### PWA 설치 버튼이 나타나지 않는 경우:
1. HTTPS 연결 확인
2. Service Worker 등록 확인
3. manifest.json 유효성 검사

### 오프라인 기능이 작동하지 않는 경우:
1. Service Worker 등록 상태 확인
2. 캐시 정책 확인
3. 네트워크 연결 상태 확인

## 📄 라이센스

MIT License

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**🎯 안드로이드 배포 준비 완료!** 
이 앱은 안드로이드 디바이스에서 네이티브 앱처럼 설치하고 사용할 수 있도록 완전히 최적화되었습니다. 