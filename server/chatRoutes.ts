import express from 'express';
import { openaiService, ChatMessage, ModelType, AVAILABLE_MODELS } from './openaiService';

const router = express.Router();

// 채팅 완성 API (일반)
router.post('/chat', async (req, res) => {
  try {
    const { 
      messages, 
      model = 'gpt-4o', 
      temperature = 0.7, 
      max_tokens = 1000 
    }: {
      messages: ChatMessage[];
      model?: ModelType;
      temperature?: number;
      max_tokens?: number;
    } = req.body;

    // 입력 검증
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: '메시지가 필요합니다.',
        code: 'INVALID_MESSAGES'
      });
    }

    // 메시지 형식 검증
    const isValidMessage = (msg: any): msg is ChatMessage => {
      return msg && 
             typeof msg.content === 'string' && 
             ['system', 'user', 'assistant'].includes(msg.role);
    };

    if (!messages.every(isValidMessage)) {
      return res.status(400).json({
        error: '잘못된 메시지 형식입니다.',
        code: 'INVALID_MESSAGE_FORMAT'
      });
    }

    // GPT API 호출
    const response = await openaiService.createChatCompletion(
      messages,
      model,
      { temperature, max_tokens }
    );

    res.json({
      success: true,
      data: {
        message: response.message,
        model: response.model,
        usage: response.usage,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('채팅 API 오류:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '서버 내부 오류',
      code: 'CHAT_ERROR'
    });
  }
});

// 스트리밍 채팅 완성 API
router.post('/chat/stream', async (req, res) => {
  try {
    const { 
      messages, 
      model = 'gpt-4o', 
      temperature = 0.7, 
      max_tokens = 1000 
    }: {
      messages: ChatMessage[];
      model?: ModelType;
      temperature?: number;
      max_tokens?: number;
    } = req.body;

    // 입력 검증
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: '메시지가 필요합니다.',
        code: 'INVALID_MESSAGES'
      });
    }

    // 메시지 형식 검증
    const isValidMessage = (msg: any): msg is ChatMessage => {
      return msg && 
             typeof msg.content === 'string' && 
             ['system', 'user', 'assistant'].includes(msg.role);
    };

    if (!messages.every(isValidMessage)) {
      return res.status(400).json({
        error: '잘못된 메시지 형식입니다.',
        code: 'INVALID_MESSAGE_FORMAT'
      });
    }

    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no' // nginx 버퍼링 비활성화
    });

    // 연결 유지를 위한 하트비트
    const heartbeat = setInterval(() => {
      if (!res.headersSent) {
        res.write(': heartbeat\n\n');
      }
    }, 30000);

    try {
      // 스트리밍 시작 신호
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      // GPT 스트리밍 응답 처리
      const stream = openaiService.createStreamingChatCompletion(
        messages,
        model,
        { temperature, max_tokens }
      );

      for await (const chunk of stream) {
        if (res.destroyed) break; // 연결이 끊어진 경우 중단
        
        res.write(`data: ${JSON.stringify({ 
          type: 'chunk', 
          content: chunk 
        })}\n\n`);
      }

      // 스트리밍 완료 신호
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
      }

    } catch (streamError) {
      console.error('스트리밍 처리 오류:', streamError);
      // 스트리밍 중 오류 발생
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: streamError instanceof Error ? streamError.message : '스트리밍 오류'
        })}\n\n`);
        res.end();
      }
    } finally {
      clearInterval(heartbeat);
    }

    // 클라이언트 연결 종료 처리
    req.on('close', () => {
      clearInterval(heartbeat);
    });

  } catch (error) {
    console.error('스트리밍 채팅 API 오류:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '서버 내부 오류',
        code: 'STREAMING_ERROR'
      });
    }
  }
});

// 사용 가능한 모델 목록 API
router.get('/models', (req, res) => {
  res.json({
    success: true,
    data: {
      models: AVAILABLE_MODELS,
      default: 'gpt-4o'
    }
  });
});

// 모델 상태 확인 API
router.get('/models/:model/status', async (req, res) => {
  try {
    const model = req.params.model as ModelType;
    
    if (!(model in AVAILABLE_MODELS)) {
      return res.status(400).json({
        error: '지원하지 않는 모델입니다.',
        code: 'UNSUPPORTED_MODEL'
      });
    }

    const isAvailable = await openaiService.checkModelAvailability(model);
    
    res.json({
      success: true,
      data: {
        model,
        available: isAvailable,
        name: AVAILABLE_MODELS[model]
      }
    });

  } catch (error) {
    console.error('모델 상태 확인 오류:', error);
    res.status(500).json({
      error: '모델 상태 확인 실패',
      code: 'MODEL_CHECK_ERROR'
    });
  }
});

// 채팅 대화 시작을 위한 도우미 API
router.post('/chat/start', (req, res) => {
  const { systemPrompt = '당신은 도움이 되고 친근한 AI 어시스턴트입니다.' } = req.body;
  
  const initialMessages: ChatMessage[] = [
    openaiService.createSystemMessage(systemPrompt)
  ];

  res.json({
    success: true,
    data: {
      messages: initialMessages,
      sessionId: Date.now().toString(), // 간단한 세션 ID
      timestamp: new Date().toISOString()
    }
  });
});

export default router;