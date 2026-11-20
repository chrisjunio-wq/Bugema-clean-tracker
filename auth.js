
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set and contain at least 32 characters'
    );
  }

  return secret;
}

function requireAuth(db) {
  return async (req, res, next) => {
    const header = req.headers.authorization;

    if (
      typeof header !== 'string' ||
      !header.startsWith('Bearer ') ||
      !header.slice(7).trim()
    ) {
      return res.status(401).json({
        error: 'Please log in first'
      });
    }

    const token = header.slice(7).trim();

    try {
      const payload = jwt.verify(token, getJwtSecret());

      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.userId !== 'string' ||
        !ObjectId.isValid(payload.userId)
      ) {
        return res.status(401).json({
          error: 'Invalid login token'
        });
      }

      const user = await db.collection('users').findOne(
        { _id: new ObjectId(payload.userId) },
        {
          projection: {
            password: 0
          }
        }
      );

      if (!user) {
        return res.status(401).json({
          error: 'User account not found'
        });
      }

      req.user = {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      };

      return next();
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError' ||
        error.name === 'NotBeforeError'
      ) {
        return res.status(401).json({
          error: 'Invalid or expired login token'
        });
      }

      console.error('Authentication error:', error);

      return res.status(500).json({
        error: 'Authentication could not be completed'
      });
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Administrator access required'
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin
};
