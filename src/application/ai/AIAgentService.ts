import { GoogleGenerativeAI } from '@google/generative-ai';
import { logInfo, logError, logWarn } from '../../utils/logger';

/**
 * AI Agent Service using Gemini Pro 2.0 Flash
 * Handles automatic replies to WhatsApp messages
 */
export class AIAgentService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private isEnabled: boolean = false;
  private apiKey: string | null = null;

  // AI Agent configuration
  private systemPrompt = `أنت مساعد ذكي لخدمة العملاء في شركة AWFAR CRM.
مهمتك هي الرد على استفسارات العملاء بطريقة احترافية ومفيدة.

قواعد الرد:
- الرد باللغة العربية أو الإنجليزية حسب لغة العميل
- كن مهذباً ومحترفاً
- إذا لم تعرف الإجابة، اعتذر بأدب واطلب من العميل الانتظار للتواصل مع موظف
- أجب بشكل مختصر ومفيد (2-3 جمل max)
- لا تعطي معلومات خاطئة أو تخمينات

معلومات الشركة:
- اسم الشركة: AWFAR CRM
- الخدمة: نظام إدارة علاقات العملاء عبر WhatsApp
- ساعات العمل: 9 صباحاً - 6 مساءً (السبت - الخميس)`;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || null;
    
    if (this.apiKey) {
      this.initialize();
    } else {
      logWarn('Gemini API key not found. AI Agent disabled.');
    }
  }

  /**
   * Initialize Gemini AI
   */
  private initialize(): void {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key is required');
      }

      this.genAI = new GoogleGenerativeAI(this.apiKey);
      
      // Use Gemini Pro 2.0 Flash (fastest model)
      this.model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200, // Keep responses concise
          topP: 0.9,
        },
      });

      logInfo('AI Agent initialized with Gemini Pro 2.0 Flash');
    } catch (error) {
      logError('Failed to initialize AI Agent', error as Error);
      this.genAI = null;
      this.model = null;
    }
  }

  /**
   * Enable AI Agent
   */
  enable(): void {
    if (!this.model) {
      logWarn('Cannot enable AI Agent: Gemini not initialized');
      return;
    }
    
    this.isEnabled = true;
    logInfo('✅ AI Agent ENABLED - Auto-reply active');
  }

  /**
   * Disable AI Agent
   */
  disable(): void {
    this.isEnabled = false;
    logInfo('❌ AI Agent DISABLED - Auto-reply inactive');
  }

  /**
   * Check if AI Agent is enabled
   */
  isActive(): boolean {
    return this.isEnabled && this.model !== null;
  }

  /**
   * Get AI Agent status
   */
  getStatus(): {
    enabled: boolean;
    modelReady: boolean;
    model: string;
  } {
    return {
      enabled: this.isEnabled,
      modelReady: this.model !== null,
      model: 'gemini-2.0-flash-exp',
    };
  }

  /**
   * Generate AI response for a message
   * @param message - User message
   * @param context - Optional conversation context
   */
  async generateResponse(
    message: string,
    context?: {
      senderName?: string;
      previousMessages?: Array<{ role: string; content: string }>;
    }
  ): Promise<string | null> {
    if (!this.isActive()) {
      logWarn('AI Agent is disabled. No response generated.');
      return null;
    }

    try {
      // Build conversation history
      const conversationHistory = context?.previousMessages || [];
      
      // Create chat with history
      const chat = this.model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: this.systemPrompt }],
          },
          {
            role: 'model',
            parts: [{ text: 'فهمت. سأساعد العملاء بطريقة احترافية ومفيدة.' }],
          },
          ...conversationHistory.map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          })),
        ],
      });

      // Generate response
      const result = await chat.sendMessage(message);
      const response = result.response.text();

      logInfo(`AI Response generated for message: "${message.substring(0, 50)}..."`);
      return response;
    } catch (error) {
      logError('Failed to generate AI response', error as Error);
      return null;
    }
  }

  /**
   * Generate response with retry logic
   */
  async generateResponseWithRetry(
    message: string,
    context?: {
      senderName?: string;
      previousMessages?: Array<{ role: string; content: string }>;
    },
    maxRetries: number = 2
  ): Promise<string | null> {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this.generateResponse(message, context);
        if (response) {
          return response;
        }
      } catch (error) {
        attempt++;
        logWarn(`AI response attempt ${attempt}/${maxRetries} failed`);
        
        if (attempt >= maxRetries) {
          logError('Max retries reached for AI response', error as Error);
          return null;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    return null;
  }

  /**
   * Update system prompt
   */
  updateSystemPrompt(newPrompt: string): void {
    this.systemPrompt = newPrompt;
    logInfo('AI Agent system prompt updated');
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }
}
