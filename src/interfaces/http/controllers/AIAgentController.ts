import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { getAISettings, updateAISettings, getAIStats } from '../../../infrastructure/supabase/whatsappRepository';
import logger from '../../../utils/logger';

/**
 * AI Agent Controller
 * Handles AI auto-reply settings and statistics
 */

/**
 * Get AI agent status
 * GET /api/ai/status
 */
export async function getStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const settings = await getAISettings(ownerId);
    const stats = await getAIStats(ownerId);

    res.json({
      isEnabled: settings?.is_enabled || false,
      model: 'gemini-2.0-flash-exp',
      settings: settings ? {
        systemPrompt: settings.system_prompt,
        autoReplyDelaySeconds: settings.auto_reply_delay_seconds,
        maxTokens: settings.max_tokens,
        temperature: settings.temperature
      } : null,
      stats: stats || {
        totalConversations: 0,
        successfulResponses: 0,
        avgResponseTimeMs: 0
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Enable AI agent
 * POST /api/ai/enable
 */
export async function enable(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const settings = await updateAISettings(ownerId, {
      is_enabled: true
    });

    logger.info(`AI agent enabled for owner ${ownerId}`);

    res.json({
      success: true,
      message: 'AI agent enabled successfully',
      isEnabled: settings.is_enabled
    });
  } catch (error) {
    logger.error(`Failed to enable AI agent: ${error}`);
    next(error);
  }
}

/**
 * Disable AI agent
 * POST /api/ai/disable
 */
export async function disable(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const settings = await updateAISettings(ownerId, {
      is_enabled: false
    });

    logger.info(`AI agent disabled for owner ${ownerId}`);

    res.json({
      success: true,
      message: 'AI agent disabled successfully',
      isEnabled: settings.is_enabled
    });
  } catch (error) {
    logger.error(`Failed to disable AI agent: ${error}`);
    next(error);
  }
}

/**
 * Update AI agent system prompt
 * PUT /api/ai/prompt
 * Body: { systemPrompt: string }
 */
export async function updatePrompt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;
    const { systemPrompt } = req.body;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      res.status(400).json({ error: 'System prompt is required and must be a string' });
      return;
    }

    if (systemPrompt.length > 1000) {
      res.status(400).json({ error: 'System prompt must be less than 1000 characters' });
      return;
    }

    const settings = await updateAISettings(ownerId, {
      system_prompt: systemPrompt
    });

    logger.info(`AI agent system prompt updated for owner ${ownerId}`);

    res.json({
      success: true,
      message: 'System prompt updated successfully',
      systemPrompt: settings.system_prompt
    });
  } catch (error) {
    logger.error(`Failed to update system prompt: ${error}`);
    next(error);
  }
}

/**
 * Update AI agent configuration
 * PUT /api/ai/config
 * Body: { autoReplyDelaySeconds?, maxTokens?, temperature? }
 */
export async function updateConfig(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;
    const { autoReplyDelaySeconds, maxTokens, temperature } = req.body;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const updates: any = {};

    if (autoReplyDelaySeconds !== undefined) {
      if (typeof autoReplyDelaySeconds !== 'number' || autoReplyDelaySeconds < 0 || autoReplyDelaySeconds > 60) {
        res.status(400).json({ error: 'autoReplyDelaySeconds must be between 0 and 60' });
        return;
      }
      updates.auto_reply_delay_seconds = autoReplyDelaySeconds;
    }

    if (maxTokens !== undefined) {
      if (typeof maxTokens !== 'number' || maxTokens < 50 || maxTokens > 1000) {
        res.status(400).json({ error: 'maxTokens must be between 50 and 1000' });
        return;
      }
      updates.max_tokens = maxTokens;
    }

    if (temperature !== undefined) {
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
        res.status(400).json({ error: 'temperature must be between 0 and 2' });
        return;
      }
      updates.temperature = temperature;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid configuration updates provided' });
      return;
    }

    const settings = await updateAISettings(ownerId, updates);

    logger.info(`AI agent configuration updated for owner ${ownerId}`, updates);

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: {
        autoReplyDelaySeconds: settings.auto_reply_delay_seconds,
        maxTokens: settings.max_tokens,
        temperature: settings.temperature
      }
    });
  } catch (error) {
    logger.error(`Failed to update AI config: ${error}`);
    next(error);
  }
}

/**
 * Get AI agent statistics
 * GET /api/ai/stats
 */
export async function getStatistics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const stats = await getAIStats(ownerId);

    res.json({
      stats: stats || {
        totalConversations: 0,
        successfulResponses: 0,
        avgResponseTimeMs: 0
      }
    });
  } catch (error) {
    next(error);
  }
}
