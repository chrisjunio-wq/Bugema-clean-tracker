
'use strict';

const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be configured and contain at least 32 characters.'
    );
  }

  return secret;
}

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization;

  if (typeof authorization !== 'string') {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : null;
}

function requireAuth(db) {
  return async function authenticateRequest(req, res, next) {
    try {
      const token = getTokenFromRequest(req);

      if (!token) {
        return res.status(401).json({
          error: 'Authentication required.'
        });
      }

      const decoded = jwt.verify(token, getJwtSecret(), {
        algorithms: ['HS256'],
        issuer: 'bugema-clean-tracker',
        audience: 'bugema-clean-tracker-users'
      });

      if (
        !decoded ||
        typeof decoded.userId !== 'string' ||
        !ObjectId.isValid(decoded.userId)
      ) {
        return res.status(401).json({
          error: 'Invalid authentication token.'
        });
      }

      const user = await db.collection('users').findOne(
        { _id: new ObjectId(decoded.userId) },
        {
          projection: {
            passwordHash: 0
          }
        }
      );

      if (!user) {
        return res.status(401).json({
          error: 'Account no longer exists.'
        });
      }

      const currentTokenVersion = Number(user.tokenVersion || 0);
      const tokenVersion = Number(decoded.tokenVersion ?? 0);

      if (
        !Number.isInteger(currentTokenVersion) ||
        !Number.isInteger(tokenVersion) ||
        tokenVersion !== currentTokenVersion
      ) {
        return res.status(401).json({
          error: 'Your session has expired. Please sign in again.'
        });
      }

      if (user.disabled === true) {
        return res.status(403).json({
          error: 'This account has been disabled.'
        });
      }

      req.user = user;
      req.auth = decoded;

      return next();
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError' ||
        error.name === 'NotBeforeError'
      ) {
        return res.status(401).json({
          error: 'Invalid or expired authentication token.'
        });
      }

      console.error('Authentication error:', error.message);

      return res.status(500).json({
        error: 'Authentication could not be completed.'
      });
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required.'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Administrator access required.'
    });
  }

  return next();
}

module.exports = {
  getJwtSecret,
  requireAuth,
  requireAdmin
};
