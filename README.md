# 게임 앱 (GPT 채팅 지원)

이 프로젝트는 React + TypeScript로 개발된 게임 앱으로, GPT 모델과의 채팅 기능이 추가되었습니다.

## 🚀 주요 기능

- 🎮 기본 게임 기능
- 🤖 **GPT 채팅 시스템**
  - 최신 GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo 모델 지원
  - 실시간 스트리밍 응답
  - 사용자 정의 설정 (Temperature, Max Tokens)
  - 현대적이고 반응형 UI

## 📋 설정 요구사항

### 1. OpenAI API 키 설정

1. [OpenAI Platform](https://platform.openai.com/)에서 API 키를 발급받으세요.
2. 프로젝트 루트의 `.env` 파일을 편집하세요:

```env
# OpenAI API 키를 여기에 입력하세요
OPENAI_API_KEY=your_openai_api_key_here

# 서버 포트 (선택사항)
PORT=5000
```

### 2. 의존성 설치

```bash
npm install
```

## 🔧 개발 및 실행

### 프론트엔드 실행
```bash
npm start
```

### 백엔드 서버 실행 (별도 터미널)
```bash
cd server
npx ts-node server.ts
```

## 🤖 GPT 채팅 사용법

1. **로그인 후 GPT 버튼 클릭**: 화면 우하단의 "🤖 GPT" 버튼을 클릭합니다.

2. **모델 선택**: 
   - GPT-4o (가장 발전된 모델) - 추천
   - GPT-4o Mini (빠르고 효율적)
   - GPT-4 Turbo (고성능)
   - GPT-3.5 Turbo (경제적)

3. **설정 조정**:
   - **창의성 (Temperature)**: 0-2 범위, 높을수록 창의적
   - **최대 토큰**: 응답 길이 제한
   - **스트리밍 모드**: 실시간으로 응답 확인 가능

4. **채팅 시작**: 메시지를 입력하고 Enter 키 또는 전송 버튼을 클릭합니다.

## 🛠️ API 엔드포인트

### GPT 채팅 관련 API

- `POST /api/chat` - 일반 채팅 완성
- `POST /api/chat/stream` - 스트리밍 채팅 완성
- `GET /api/models` - 사용 가능한 모델 목록
- `GET /api/models/:model/status` - 모델 상태 확인
- `POST /api/chat/start` - 새 채팅 세션 시작

### 요청 예시

```javascript
// 일반 채팅
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '안녕하세요!' }
    ],
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 1000
  })
});
```

## 💡 주요 특징

### 🎨 사용자 친화적 UI
- 현대적인 그라디언트 디자인
- 반응형 레이아웃 (모바일 지원)
- 다크 모드 자동 지원
- 스트리밍 애니메이션 효과

### ⚡ 고급 기능
- **실시간 스트리밍**: 응답을 실시간으로 확인
- **모델 전환**: 용도에 맞는 모델 선택 가능
- **설정 조정**: Temperature, Max Tokens 실시간 조정
- **채팅 히스토리**: 대화 맥락 유지

### 🔐 보안 및 성능
- API 키 서버 사이드 관리
- CORS 설정으로 안전한 API 호출
- 오류 처리 및 재시도 로직
- 메모리 효율적인 스트리밍

## 🚀 배포

### 프로덕션 빌드
```bash
npm run build
```

### 환경 변수 설정
배포 시 다음 환경 변수를 설정해야 합니다:
- `OPENAI_API_KEY`: OpenAI API 키
- `PORT`: 서버 포트 (기본값: 5000)

## 📖 기술 스택

- **Frontend**: React, TypeScript, CSS3
- **Backend**: Node.js, Express, TypeScript
- **AI**: OpenAI GPT API
- **기타**: Socket.IO, Supabase

## 🐛 문제해결

### API 키 관련 오류
```
채팅 생성 실패: Request failed with status code 401
```
- `.env` 파일의 `OPENAI_API_KEY`가 올바른지 확인하세요.
- OpenAI 계정에 충분한 크레딧이 있는지 확인하세요.

### 스트리밍 연결 오류
```
스트리밍 연결 오류
```
- 네트워크 연결을 확인하세요.
- 브라우저가 Server-Sent Events를 지원하는지 확인하세요.

### 모델 사용 불가
```
모델 gpt-4o 사용 불가
```
- OpenAI 계정이 해당 모델에 액세스 권한이 있는지 확인하세요.
- API 사용량 한도를 확인하세요.

## 📞 지원

문제가 발생하면 다음을 확인해주세요:
1. `.env` 파일이 올바르게 설정되었는지
2. OpenAI API 키가 유효한지
3. 네트워크 연결이 안정적인지
4. 브라우저 콘솔에서 오류 메시지 확인
