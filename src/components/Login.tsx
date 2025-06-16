import React from 'react';
import '../App.css';

// 카카오 키 설정
const KAKAO_CLIENT_ID = "gPT54R09CbbIzB27q5YCW7PXcSKQKagP"; // JavaScript 키
const KAKAO_REST_API_KEY = "40760893eb3174adb204481409f7fb02"; // REST API 키
// 리다이렉트 URI 경로
const REDIRECT_URI = `${window.location.origin}/api/auth/kakao/callback`;

const Login: React.FC = () => {
  const handleKakaoLogin = () => {
    // 카카오 로그인 디버깅 정보 출력
    console.log("카카오 로그인 시도:");
    console.log("- Client ID (JS 키):", KAKAO_CLIENT_ID);
    console.log("- REST API 키:", KAKAO_REST_API_KEY);
    console.log("- Redirect URI:", REDIRECT_URI);
    
    // REST API 키를 사용하여 로그인 요청
    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${REDIRECT_URI}&response_type=code`;
    window.location.href = kakaoAuthUrl;
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <h1 className="login-title">TruckTalk</h1>
        <p className="login-subtitle">트럭 운전자를 위한 음성 통화 서비스</p>
        
        <button 
          className="kakao-login-button" 
          onClick={handleKakaoLogin}
        >
          <img 
            src="https://developers.kakao.com/assets/img/about/logos/kakaologo.png" 
            alt="Kakao Logo" 
            className="kakao-logo"
          />
          카카오 계정으로 로그인
        </button>
        
        <p className="login-info">로그인하여 주변 기사님들과 대화하세요</p>
      </div>
    </div>
  );
};

export default Login; 