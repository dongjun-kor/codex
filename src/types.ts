export interface Position {
  lat: number;
  lng: number;
}

// 운행 상태 인터페이스
export interface ExtendedDrivingState {
  isDriving: boolean;        // 현재 운행 중인지
  drivingStartTime: number;  // 운행 시작 시간 (timestamp)
  restStartTime: number;     // 휴식 시작 시간 (timestamp)
  lastPosition: Position;    // 마지막 위치
  lastSpeedCheck: number;    // 마지막 속도 체크 시간 (timestamp)
  isZeroSpeed: boolean;      // 현재 0km/h 상태인지
  zeroSpeedStartTime: number; // 0km/h 시작 시간 (timestamp)
  totalDrivingTime: number;  // 총 운행 시간 (초) - 누적된 시간
  currentSessionTime: number; // 현재 세션 운행 시간 (초)
  isResting: boolean;        // 휴식 중인지 여부
  restDuration: number;      // 현재 휴식 시간 (초)
  hasInitialized: boolean;   // 위치 초기화 여부
  isSleeping: boolean;       // 수면 중인지 여부
}

// 알림 상태 인터페이스
export interface AlertState {
  hasShown2HourAlert: boolean;
  hasShown3HourAlert: boolean;
  hasShown4HourAlert: boolean;
  hasShownRestAlert: boolean;
  hasShownRestCompleteAlert: boolean;
  lastMainAlertTime: number;
  lastRestAlertTime: number;
  isSnoozing: boolean;
  snoozeEndTime: number;
}

// 주변 사용자 타입에 통화 중 상태 추가
export interface NearbyUser {
  id: string;
  pos: Position;
  nickname?: string;
  inCallWith?: string; // 통화 중인 상대방 ID
}

export interface Player {
  id: string;
  avatar: number;
  pos: Position;
  goal: Position;
  stream?: StreamSplit;
  nickname?: string;
  inCallWith?: string; // 통화 중인 상대방 ID
}

export interface StreamSplitOptions {
  left?: number;
  right?: number;
}

export class StreamSplit {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  channels: {
    left: GainNode;
    right: GainNode;
  };
  destination: MediaStreamAudioDestinationNode;

  constructor(stream: MediaStream, options: StreamSplitOptions = {}) {
    const { left = 1, right = 1 } = options;
    this.stream = stream;

    // 오디오 스트림을 소스로 하는 오디오 컨텍스트 생성
    const track = stream.getAudioTracks()[0];
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(new MediaStream([track]));

    // 각 귀(왼쪽, 오른쪽)에 대한 채널 생성
    this.channels = {
      left: this.context.createGain(),
      right: this.context.createGain(),
    };

    // 게인 연결
    this.source.connect(this.channels.left);
    this.source.connect(this.channels.right);

    // 두 게인을 결합하는 머저 생성
    const merger = this.context.createChannelMerger(2);
    this.channels.left.connect(merger, 0, 0);
    this.channels.right.connect(merger, 0, 1);

    // 각 측면의 볼륨 설정
    this.setVolume(left, right);

    // 머저를 오디오 컨텍스트에 연결
    merger.connect(this.context.destination);

    this.destination = this.context.createMediaStreamDestination();
  }

  // 볼륨 설정
  setVolume(left = 0, right = 0) {
    // 볼륨을 0과 1 사이로 제한
    left = Math.max(Math.min(left, 1), 0);
    right = Math.max(Math.min(right, 1), 0);

    // 볼륨이 0이면 스트림 비활성화
    const audioTracks = this.stream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = left !== 0 && right !== 0;
    });

    // 각 채널의 게인 볼륨 설정
    this.channels.left.gain.value = left;
    this.channels.right.gain.value = right;
  }

  // 컨텍스트 종료, 오디오 중지
  close() {
    return this.context.close();
  }
} 