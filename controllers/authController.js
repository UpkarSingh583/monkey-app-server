import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, email, password, interests, location } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email 
          ? 'Email already registered' 
          : 'Username already taken'
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      interests: interests || [],
      location
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user data without password
    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      interests: user.interests,
      location: user.location,
      avatar: user.avatar,
      isOnline: user.isOnline
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account has been banned'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update user online status
    user.isOnline = true;
    await user.updateLastSeen();

    // Generate token
    const token = generateToken(user._id);

    // Return user data without password
    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      interests: user.interests,
      location: user.location,
      avatar: user.avatar,
      isOnline: user.isOnline
    };

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.isOnline = false;
      await user.updateLastSeen();
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        interests: user.interests,
        location: user.location,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, interests, location, preferences } = req.body;
    const user = await User.findById(req.user.id);

    // Check if username is taken by another user
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken'
        });
      }
    }

    // Update user fields
    if (username) user.username = username;
    if (interests) user.interests = interests;
    if (location) user.location = location;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      interests: user.interests,
      location: user.location,
      avatar: user.avatar,
      isOnline: user.isOnline,
      preferences: user.preferences
    };

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: userData
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};