
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  getJwtSecret,
  requireAuth
} = require('./auth');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const loginAttempts = new Map();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string') {
    return 'Password is required.';
  }

  if (password.length < 12) {
    return 'Password must contain at least 12 characters.';
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must not exceed 72 UTF-8 bytes.';
  }

  return null;
}

function getClientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function checkLoginLimit(req, res, next) {
  const now = Date.now();
  const key = getClientKey(req);
  const record = loginAttempts.get(key);

  if (!record || now - record.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {
      startedAt: now,
      count: 0
    });

    return next();
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfter = Math.ceil(
      (LOGIN_WINDOW_MS - (now - record.startedAt)) / 1000
    );

    res.setHeader('Retry-After', String(retryAfter));

    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.'
    });
  }

  return next();
}

function recordLoginAttempt(req) {
  const key = getClientKey(req);
  const record = loginAttempts.get(key);

  if (record) {
    record.count += 1;
  }
}

function clearLoginAttempts(req) {
  loginAttempts.delete(getClientKey(req));
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      tokenVersion: Number(user.tokenVersion || 0)
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn: '2h',
      issuer: 'bugema-clean-tracker',
      audience: 'bugema-clean-tracker-users'
    }
  );
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function routerFactory(db) {
  const router = express.Router();
  const users = db.collection('users');

  router.post('/register', async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;

      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({
          error: 'Name must contain between 2 and 80 characters.'
        });
      }

      if (!validEmail(email)) {
        return res.status(400).json({
          error: 'Enter a valid email address.'
        });
      }

      const passwordError = validatePassword(password);

      if (passwordError) {
        return res.status(400).json({
          error: passwordError
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const now = new Date();

      const user = {
        name,
        email,
        passwordHash,
        role: 'user',
        tokenVersion: 0,
        disabled: false,
        createdAt: now,
        updatedAt: now
      };

      const result = await users.insertOne(user);

      user._id = result.insertedId;

      return res.status(201).json({
        message: 'Account created successfully.',
        user: publicUser(user)
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'An account with this email already exists.'
        });
      }

      console.error('Registration error:', error.message);

      return res.status(500).json({
        error: 'Registration could not be completed.'
      });
    }
  });

  router.post('/login', checkLoginLimit, async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;

      if (!validEmail(email) || typeof password !== 'string') {
        recordLoginAttempt(req);

        return res.status(401).json({
          error: 'Invalid email or password.'
        });
      }

      const user = await users.findOne({ email });

      if (!user || user.disabled === true) {
        recordLoginAttempt(req);

        return res.status(401).json({
          error: 'Invalid email or password.'
        });
      }

      const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash || ''
      );

      if (!passwordMatches) {
        recordLoginAttempt(req);

        return res.status(401).json({
          error: 'Invalid email or password.'
        });
      }

      clearLoginAttempts(req);

      const token = createToken(user);

      return res.json({
        message: 'Login successful.',
        token,
        user: publicUser(user)
      });
    } catch (error) {
      console.error('Login error:', error.message);

      return res.status(500).json({
        error: 'Login could not be completed.'
      });
    }
  });

  router.get('/me', requireAuth(db), (req, res) => {
    return res.json({
      user: publicUser(req.user)
    });
  });

  return router;
}

module.exports = routerFactory;
