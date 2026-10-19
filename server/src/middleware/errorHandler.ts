import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Safe centralized error handler
 * Sanitizes errors and ensures no sensitive stack traces, private paths, or internal tokens leak
 */
export function errorHandler(
  err: any,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const requestId = req.requestId || 'unknown';

  // Log detailed diagnostic info safely on the server side
  console.error(`[Error] [ReqID: ${requestId}] ${err.message}`, {
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  const isClientError = status >= 400 && status < 500;
  const safeMessage = isClientError 
    ? err.message 
    : 'An unexpected internal error occurred. Please contact system support with your request ID.';

  res.status(status).json({
    error: safeMessage,
    requestId,
    code: err.code || (status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR')
  });
}
