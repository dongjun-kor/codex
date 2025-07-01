import React, { useState, useRef, useEffect } from 'react';
import './GPTChat.css';

// 메시지 타입 정의
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

// API 응답 타입
interface ChatResponse {
  success: boolean;
  data?: {
    message: string;
    model: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    timestamp: string;
  };
  error?: string;
}

// 사용 가능한 모델 타입
const AVAILABLE_MODELS = {
  'gpt-4o': 'GPT-4o (가장 발전된 모델)',
  'gpt-4o-mini': 'GPT-4o Mini (빠르고 효율적)',
  'gpt-4-turbo': 'GPT-4 Turbo (고성능)',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo (경제적)',
} as const;

type ModelType = keyof typeof AVAILABLE_MODELS;

interface GPTChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const GPTChat: React.FC<GPTChatProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelType>('gpt-4o');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 목록을 자동으로 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  // 채팅 시작 시 시스템 메시지 설정
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      startNewChat();
    }
  }, [isOpen]);

  // 새 채팅 시작
  const startNewChat = async () => {
    try {
      const response = await fetch('/api/chat/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemPrompt: '당신은 도움이 되는 AI 어시스턴트입니다. 한국어로 친절하고 정확하게 답변해주세요.'
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessages(data.data.messages);
      }
    } catch (error) {
      console.error('채팅 시작 오류:', error);
    }
  };

  // 일반 채팅 전송
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || isStreaming) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      if (streamingEnabled) {
        await sendStreamingMessage(newMessages);
      } else {
        await sendRegularMessage(newMessages);
      }
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 일반 메시지 전송
  const sendRegularMessage = async (messagesToSend: ChatMessage[]) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messagesToSend,
        model: selectedModel,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const data: ChatResponse = await response.json();
    
    if (data.success && data.data) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.data.message,
        timestamp: data.data.timestamp,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } else {
      throw new Error(data.error || '응답을 받지 못했습니다.');
    }
  };

  // 스트리밍 메시지 전송
  const sendStreamingMessage = async (messagesToSend: ChatMessage[]) => {
    setIsStreaming(true);
    setStreamingMessage('');

    try {
      // 스트리밍 요청 전송
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesToSend,
          model: selectedModel,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('스트림 리더를 생성할 수 없습니다.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentStreamingMessage = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(':')) continue;

            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                
                switch (data.type) {
                  case 'start':
                    currentStreamingMessage = '';
                    setStreamingMessage('');
                    break;
                  case 'chunk':
                    currentStreamingMessage += data.content;
                    setStreamingMessage(currentStreamingMessage);
                    break;
                  case 'end':
                    const finalMessage: ChatMessage = {
                      role: 'assistant',
                      content: currentStreamingMessage || '응답이 완료되었습니다.',
                      timestamp: new Date().toISOString(),
                    };
                    setMessages(prev => [...prev, finalMessage]);
                    setStreamingMessage('');
                    setIsStreaming(false);
                    return;
                  case 'error':
                    throw new Error(data.error);
                }
              } catch (parseError) {
                console.error('스트리밍 데이터 파싱 오류:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 스트리밍이 정상적으로 끝나지 않은 경우
      if (currentStreamingMessage) {
        const finalMessage: ChatMessage = {
          role: 'assistant',
          content: currentStreamingMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, finalMessage]);
        setStreamingMessage('');
      }
      setIsStreaming(false);

    } catch (error) {
      console.error('스트리밍 요청 오류:', error);
      setIsStreaming(false);
      setStreamingMessage('');
      
      // 오류 메시지 표시
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `스트리밍 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // 엔터 키로 메시지 전송
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 채팅 초기화
  const clearChat = () => {
    setMessages([]);
    setStreamingMessage('');
    startNewChat();
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // 정리 작업이 필요한 경우 여기에 추가
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="gpt-chat-overlay">
      <div className="gpt-chat-container">
        {/* 헤더 */}
        <div className="gpt-chat-header">
          <h3>GPT 채팅</h3>
          <div className="gpt-chat-controls">
            <button onClick={clearChat} className="clear-btn">
              🗑️ 초기화
            </button>
            <button onClick={onClose} className="close-btn">
              ✕
            </button>
          </div>
        </div>

        {/* 설정 패널 */}
        <div className="gpt-chat-settings">
          <div className="setting-group">
            <label>모델:</label>
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value as ModelType)}
            >
              {Object.entries(AVAILABLE_MODELS).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>
          
          <div className="setting-group">
            <label>창의성 (Temperature): {temperature}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
            />
          </div>
          
          <div className="setting-group">
            <label>최대 토큰: {maxTokens}</label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            />
          </div>
          
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={streamingEnabled}
                onChange={(e) => setStreamingEnabled(e.target.checked)}
              />
              스트리밍 모드
            </label>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="gpt-chat-messages">
          {messages.filter(msg => msg.role !== 'system').map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                {message.content}
              </div>
              <div className="message-time">
                {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
              </div>
            </div>
          ))}
          
          {/* 스트리밍 메시지 */}
          {isStreaming && streamingMessage && (
            <div className="message assistant streaming">
              <div className="message-content">
                {streamingMessage}
                <span className="cursor">|</span>
              </div>
            </div>
          )}
          
          {/* 로딩 인디케이터 */}
          {isLoading && !isStreaming && (
            <div className="message assistant">
              <div className="message-content loading">
                <span>생각하는 중</span>
                <span className="dots">...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="gpt-chat-input">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
            disabled={isLoading || isStreaming}
            rows={3}
          />
          <button 
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading || isStreaming}
            className="send-btn"
          >
            {isLoading || isStreaming ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GPTChat;