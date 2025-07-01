import OpenAI from 'openai';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 메시지 타입 정의
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

// 채팅 완성 응답 타입
export interface ChatResponse {
  message: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// GPT 모델 목록 (최신 모델 포함)
export const AVAILABLE_MODELS = {
  'gpt-4o': 'GPT-4o (가장 발전된 모델)',
  'gpt-4o-mini': 'GPT-4o Mini (빠르고 효율적)',
  'gpt-4-turbo': 'GPT-4 Turbo (고성능)',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo (경제적)',
} as const;

export type ModelType = keyof typeof AVAILABLE_MODELS;

// 채팅 완성 서비스
export class OpenAIService {
  /**
   * 채팅 메시지를 GPT 모델로 처리
   */
  async createChatCompletion(
    messages: ChatMessage[],
    model: ModelType = 'gpt-4o',
    options?: {
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    }
  ): Promise<ChatResponse> {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 1000,
      });

      const choice = completion.choices[0];
      if (!choice.message.content) {
        throw new Error('빈 응답을 받았습니다.');
      }

      return {
        message: choice.message.content,
        usage: completion.usage ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        } : undefined,
        model: completion.model,
      };
    } catch (error) {
      console.error('OpenAI API 오류:', error);
      throw new Error(`채팅 생성 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * 스트리밍 채팅 완성
   */
  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    model: ModelType = 'gpt-4o',
    options?: {
      temperature?: number;
      max_tokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 1000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenAI 스트리밍 오류:', error);
      throw new Error(`스트리밍 채팅 생성 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * 모델 상태 확인
   */
  async checkModelAvailability(model: ModelType): Promise<boolean> {
    try {
      await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });
      return true;
    } catch (error) {
      console.error(`모델 ${model} 사용 불가:`, error);
      return false;
    }
  }

  /**
   * 시스템 메시지 생성 도우미
   */
  createSystemMessage(content: string): ChatMessage {
    return {
      role: 'system',
      content,
      timestamp: new Date(),
    };
  }

  /**
   * 사용자 메시지 생성 도우미
   */
  createUserMessage(content: string): ChatMessage {
    return {
      role: 'user',
      content,
      timestamp: new Date(),
    };
  }

  /**
   * 어시스턴트 메시지 생성 도우미
   */
  createAssistantMessage(content: string): ChatMessage {
    return {
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
  }
}

// 싱글톤 인스턴스
export const openaiService = new OpenAIService();