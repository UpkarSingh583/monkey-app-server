import express from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Find potential matches based on interests and preferences
router.get('/find', authenticate, async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Build match criteria
    const matchCriteria = {
      _id: { $ne: currentUser._id }, // Exclude current user
      isOnline: true,
      isBanned: false
    };

    // Find users with similar interests
    let potentialMatches = await User.find(matchCriteria)
      .select('-password -email')
      .limit(50);

    // Score matches based on common interests
    const scoredMatches = potentialMatches.map(user => {
      const commonInterests = user.interests.filter(interest => 
        currentUser.interests.includes(interest)
      );
      
      return {
        user,
        score: commonInterests.length,
        commonInterests
      };
    });

    // Sort by score (most common interests first) and randomize ties
    scoredMatches.sort((a, b) => {
      if (b.score === a.score) {
        return Math.random() - 0.5; // Randomize equal scores
      }
      return b.score - a.score;
    });

    // Return top matches
    const matches = scoredMatches.slice(0, 10).map(match => ({
      id: match.user._id,
      username: match.user.username,
      interests: match.user.interests,
      location: match.user.location,
      avatar: match.user.avatar,
      commonInterests: match.commonInterests,
      score: match.score
    }));

    res.json({
      success: true,
      matches
    });

  } catch (error) {
    console.error('Find matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error finding matches'
    });
  }
});

// Get random match (for skip functionality)
router.get('/random', authenticate, async (req, res) => {
  try {
    const currentUser = req.user;
    
    const matchCriteria = {
      _id: { $ne: currentUser._id },
      isOnline: true,
      isBanned: false
    };

    // Get random user using aggregation
    const randomMatches = await User.aggregate([
      { $match: matchCriteria },
      { $sample: { size: 1 } },
      { $project: { password: 0, email: 0 } }
    ]);

    if (randomMatches.length === 0) {
      return res.json({
        success: false,
        message: 'No users available for matching'
      });
    }

    const match = randomMatches[0];
    const commonInterests = match.interests.filter(interest => 
      currentUser.interests.includes(interest)
    );

    res.json({
      success: true,
      match: {
        id: match._id,
        username: match.username,
        interests: match.interests,
        location: match.location,
        avatar: match.avatar,
        commonInterests
      }
    });

  } catch (error) {
    console.error('Random match error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error finding random match'
    });
  }
});

export default router;