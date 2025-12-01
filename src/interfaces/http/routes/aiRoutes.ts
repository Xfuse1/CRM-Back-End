import { Router } from 'express';
import * as AIAgentController from '../controllers/AIAgentController';
import { authenticateToken } from '../../../middleware/auth';

const router = Router();

/**
 * AI Agent Routes
 * All routes require authentication
 */

// Get AI agent status
router.get('/status', authenticateToken, AIAgentController.getStatus);

// Enable AI agent
router.post('/enable', authenticateToken, AIAgentController.enable);

// Disable AI agent
router.post('/disable', authenticateToken, AIAgentController.disable);

// Update system prompt
router.put('/prompt', authenticateToken, AIAgentController.updatePrompt);

// Update configuration
router.put('/config', authenticateToken, AIAgentController.updateConfig);

// Get statistics
router.get('/stats', authenticateToken, AIAgentController.getStatistics);

export default router;
