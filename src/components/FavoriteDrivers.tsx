import React from 'react';
import { formatDrivingTime } from '../utils/drivingMonitor';

// 즐겨찾기 사용자 상태 정의 (Game.tsx와 동일하게 정의)
enum DriverStatus {
  DRIVING = 'driving',   // 운행 중
  RESTING = 'resting',   // 휴식 중
  OFFLINE = 'offline',   // 오프라인
  SLEEPING = 'sleeping'  // 수면 중
}

// 즐겨찾기 사용자 타입 (Game.tsx와 동일하게 정의)
interface FavoriteDriver {
  id: string;            // 사용자 ID
  nickname: string;      // 닉네임
  status: DriverStatus;  // 상태
  lastSeen: number;      // 마지막 접속 시간 (타임스탬프)
  drivingTime?: number;  // 운행 시간 (초)
  isFavorite: boolean;   // 즐겨찾기 여부
}

interface FavoriteDriversProps {
  favoriteDrivers: FavoriteDriver[];
  onCallRequest: (driverId: string) => void;
  onToggleFavorite: (driverId: string) => void;
}

const FavoriteDrivers: React.FC<FavoriteDriversProps> = ({
  favoriteDrivers,
  onCallRequest,
  onToggleFavorite
}) => {
  // 상태에 따른 아이콘 및 색상 설정
  const getStatusIcon = (status: DriverStatus) => {
    switch (status) {
      case DriverStatus.DRIVING:
        return <div className="status-icon driving" title="운행 중"></div>;
      case DriverStatus.RESTING:
        return <div className="status-icon resting" title="휴식 중"></div>;
      case DriverStatus.OFFLINE:
        return <div className="status-icon offline" title="오프라인"></div>;
      case DriverStatus.SLEEPING:
        return <div className="status-icon sleeping" title="수면 중">🌙</div>;
      default:
        return <div className="status-icon offline" title="오프라인"></div>;
    }
  };

  // 상태에 따른 추가 정보 텍스트
  const getStatusText = (driver: FavoriteDriver) => {
    switch (driver.status) {
      case DriverStatus.DRIVING:
        return driver.drivingTime ? `운행: ${formatDrivingTime(driver.drivingTime)}` : '운행 중';
      case DriverStatus.RESTING:
        return '휴식 중';
      case DriverStatus.OFFLINE:
        const offlineTime = Math.floor((Date.now() - driver.lastSeen) / 60000); // 분 단위
        return `${offlineTime}분 전 오프라인`;
      case DriverStatus.SLEEPING:
        return '수면 중';
      default:
        return '';
    }
  };

  return (
    <div className="favorite-drivers-container">
      <h3 className="favorite-title">즐겨찾기 기사</h3>
      {favoriteDrivers.length === 0 ? (
        <p className="no-favorites">즐겨찾기한 기사가 없습니다.</p>
      ) : (
        <div className="favorite-list">
          {favoriteDrivers.map(driver => (
            <div key={driver.id} className="favorite-driver-card">
              <div className="driver-avatar">
                {driver.nickname.charAt(0)}
              </div>
              <div className="driver-info">
                <div className="driver-name-row">
                  <span className="driver-name">{driver.nickname} 기사님</span>
                  {getStatusIcon(driver.status)}
                </div>
                <div className="driver-status">{getStatusText(driver)}</div>
              </div>
              <div className="driver-actions">
                {driver.status !== DriverStatus.OFFLINE && (
                  <button 
                    className="call-driver-button" 
                    onClick={() => onCallRequest(driver.id)}
                  >
                    📞
                  </button>
                )}
                <button 
                  className="favorite-toggle-button" 
                  onClick={() => onToggleFavorite(driver.id)}
                >
                  ⭐
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoriteDrivers; 