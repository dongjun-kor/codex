import React, { useState, useEffect } from 'react';
import './App.css';
import Game from './components/Game';
import Login from './components/Login';
import { supabase } from './supabase/client';
import { setupVibrationHandler } from './serviceWorkerRegistration';

interface UserData {
  id: string;
  nickname: string;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    // 진동 핸들러 초기화
    setupVibrationHandler();
    
    // Service Worker 메시지 리스너 설정
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CHECK_RESET_IN_PROGRESS') {
        const { userId } = event.data;
        
        // localStorage에서 초기화 진행 상태 확인
        const resetInProgress = localStorage.getItem(`resetInProgress_${userId}`);
        
        // Service Worker에게 응답 (실제로는 Service Worker가 응답을 기다리지 않음)
        console.log(`Service Worker 초기화 상태 체크 요청: ${userId}, 진행중: ${resetInProgress === 'true'}`);
      } else if (event.data && event.data.type === 'OFFLINE_RESET') {
        const { userId, message } = event.data;
        console.log(`🌙 App - Service Worker 오프라인 초기화 알림: ${message}`);
        
        // 오프라인 초기화 알림을 사용자에게 표시 (필요시)
        // 실제 상태 초기화는 DrivingMonitor에서 처리
      }
    };
    
    // Service Worker 메시지 리스너 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }
    
    // 로그인 상태 확인
    const checkLoginStatus = () => {
      const userId = localStorage.getItem('user_id');
      const token = localStorage.getItem('kakao_token');
      if (userId && token) {
        // 저장된 사용자 정보가 있으면 사용
        setUserData({
          id: userId,
          nickname: localStorage.getItem('user_nickname') || 'User'
        });
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    };

    // URL에서 인증 코드와 사용자 ID 확인 (카카오 로그인 콜백 처리)
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get('code');
    const accessToken = url.searchParams.get('access_token');
    const userId = url.searchParams.get('user_id');
    
    if (authCode && accessToken && userId) {
      // 서버에서 처리된 로그인 정보 저장
      setIsLoading(true);
      
      // 로컬 스토리지에 정보 저장
      localStorage.setItem('kakao_token', accessToken);
      localStorage.setItem('user_id', userId);
      
      // Supabase에서 사용자 정보 가져오기
      const fetchUserData = async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
            
          if (error) {
            console.error('사용자 정보 조회 오류:', error);
          } else if (data) {
            // 사용자 정보 저장
            localStorage.setItem('user_nickname', data.nickname);
            setUserData({
              id: data.id,
              nickname: data.nickname
            });
          }
          
          // 인증 코드를 URL에서 제거
          window.history.replaceState({}, document.title, window.location.origin);
          setIsLoggedIn(true);
          setIsLoading(false);
        } catch (err) {
          console.error('사용자 정보 조회 중 오류:', err);
          setIsLoading(false);
        }
      };
      
      fetchUserData();
    } else {
      checkLoginStatus();
    }
    
    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  const handleLogout = () => {
    // 로컬 스토리지에서 모든 사용자 정보 제거
    localStorage.removeItem('kakao_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_nickname');
    
    // 초기화 관련 플래그도 제거
    const userId = userData?.id;
    if (userId) {
      localStorage.removeItem(`lastResetDate_${userId}`);
      localStorage.removeItem(`resetInProgress_${userId}`);
    }
    
    // 페이지 새로고침하여 모든 소켓 연결 및 상태 초기화
    setUserData(null);
    setIsLoggedIn(false);
    
    // 강제로 페이지 새로고침하여 소켓 연결 완전히 끊기
    window.location.reload();
  };

  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="App">
      {isLoggedIn ? (
        <>
          {userData && <Game 
            userId={userData.id} 
            userNickname={userData.nickname} 
            onLogout={handleLogout}
          />}
        </>
      ) : (
        <Login />
      )}
    </div>
  );
}

export default App;
