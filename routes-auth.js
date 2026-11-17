
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('./auth');

module.exports = function (db) {
  const router = express.Router();
  const users = db.collection('users');
  const attempts = new Map();

  function limitAttempts(maxAttempts) {
    return (req, res, next) => {
      const now = Date.now();
      const key = `${req.ip}:${req.path}`;
      let entry = attempts.get(key);

      if (!entry || entry.expiresAt <= now) {
        entry = {
          count: 0,
          expiresAt: now + 15 * 60 * 1000
        };
        attempts.set(key, entry);
      }

      if (entry.count >= maxAttempts) {
        res.setHeader(
          'Retry-After',
          String(Math.ceil((entry.expiresAt - now) / 1000))
        );
        return res.status(429).json({
          error: 'Too many attempts. Please try again later.'
        });
      }

      entry.count += 1;

      if (attempts.size > 10000) {
        for (const [attemptKey, attempt] of attempts) {
          if (attempt.expiresAt <= now) attempts.delete(attemptKey);
        }
      }

      return next();
    };
  }

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

  // REGISTER
  router.post('/register', limitAttempts(5), async (req, res) => {
    try {
      const { name, email, password } = req.body || {};

      if (
        typeof name !== 'string' ||
        name.trim().length < 2 ||
        name.trim().length > 80
      ) {
        return res.status(400).json({
          error: 'Name must be between 2 and 80 characters'
        });
      }

      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        return res.status(400).json({
          error: 'Enter a valid email address'
        });
      }

      if (
        typeof password !== 'string' ||
        password.length < 12 ||
        Buffer.byteLength(password, 'utf8') > 72
      ) {
        return res.status(400).json({
          error: 'Password must contain 12–72 UTF-8 bytes'
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existing = await users.findOne({
        email: normalizedEmail
      });

      if (existing) {
        return res.status(409).json({
          error: 'An account with this email already exists'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'user',
        createdAt: new Date()
      };

      const result = await users.insertOne(user);
      user._id = result.insertedId;

      const token = createToken(user);

      return res.status(201).json({
        message: 'Account created successfully',
        token,
        user: publicUser(user)
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'An account with this email already exists'
        });
      }

      console.error('Registration error:', error);

      return res.status(500).json({
        error: 'Registration could not be completed'
      });
    }
  });

  // LOGIN
  router.post('/login', limitAttempts(10), async (req, res) => {
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
