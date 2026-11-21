
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('./auth');

module.exports = function (db) {
  const router = express.Router();
  const users = db.collection('users');

  function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (typeof secret !== 'string' || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must contain at least 32 characters'
      );
    }

    return secret;
  }

  function createToken(user) {
    return jwt.sign(
      { userId: user._id.toString() },
      getJwtSecret(),
      { expiresIn: '2h' }
    );
  }

  function publicUser(user) {
    return {
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role
    };
  }

  // Accounts are provisioned by an administrator, not through public registration.
  router.post('/register', (req, res) => {
    return res.status(403).json({
      error: 'Public account registration is disabled. Contact an administrator.'
    });
  });

  // LOGIN
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          error: 'Email and password are required'
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const user = await users.findOne({
        email: normalizedEmail
      });

      if (!user || typeof user.password !== 'string') {
        return res.status(401).json({
          error: 'Invalid email or password'
        });
      }

      const passwordMatches = await bcrypt.compare(
        password,
        user.password
      );

      if (!passwordMatches) {
        return res.status(401).json({
          error: 'Invalid email or password'
        });
      }

      if (user.role !== 'admin') {
        return res.status(403).json({
          error: 'Administrator access only'
        });
      }

      const token = createToken(user);

      return res.json({
        message: 'Login successful',
        token,
        user: publicUser(user)
      });

    } catch (error) {
      console.error('Login error:', error);

      return res.status(500).json({
        error: 'Login could not be completed'
      });
    }
  });

  // CURRENT ACCOUNT
  router.get('/me', requireAuth(db), (req, res) => {
    return res.json(req.user);
  });

  return router;
};
