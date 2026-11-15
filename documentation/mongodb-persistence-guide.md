# MongoDB Persistence Implementation Guide

## Overview

This guide provides step-by-step instructions for adding MongoDB persistence to the GamifyLeet application's recent submissions feature. Currently, the application fetches data directly from LeetCode's API in real-time. This implementation will add caching and persistence capabilities.

## Current Architecture Analysis

### Existing Implementation
- **Location**: `packages/server/src/leetInterface/index.ts`
- **Current Method**: Direct API calls to LeetCode using `leetcode-query` package
- **Data Flow**: Client → tRPC → LeetCode API → Client
- **No persistence**: Data is fetched fresh on every request

### Existing Data Types
```typescript
// packages/server/src/types/leetcode.ts
export interface Submission {
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
  lang: string;
}

export interface LeetCodeData {
  greeting: string;
  recent_submissions: Submission[];
}
```

## Implementation Plan

### Phase 1: Database Setup

#### 1.1 Add Dependencies
```bash
cd packages/server
npm install mongoose dotenv
npm install --save-dev @types/mongoose
```

#### 1.2 Environment Configuration
Create `.env` file in `packages/server/`:
```env
MONGODB_URI=mongodb://localhost:27017/gamifyleet
NODE_ENV=development
```

#### 1.3 Database Connection
Create `packages/server/src/database/connection.ts`:
```typescript
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gamifyleet';

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('MongoDB disconnection error:', error);
  }
};
```

### Phase 2: Database Models

#### 2.1 User Model
Create `packages/server/src/database/models/User.ts`:
```typescript
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  createdAt: Date;
  updatedAt: Date;
  lastFetched: Date;
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastFetched: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const User = mongoose.model<IUser>('User', userSchema);
```

#### 2.2 Submission Model
Create `packages/server/src/database/models/Submission.ts`:
```typescript
import mongoose, { Document, Schema } from 'mongoose';

export interface ISubmission extends Document {
  username: string;
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
  lang: string;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>({
  username: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  title: {
    type: String,
    required: true
  },
  titleSlug: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true
  },
  statusDisplay: {
    type: String,
    required: true
  },
  lang: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient querying
submissionSchema.index({ username: 1, timestamp: -1 });

// Unique constraint to prevent duplicate submissions
submissionSchema.index({ username: 1, titleSlug: 1, timestamp: 1 }, { unique: true });

export const Submission = mongoose.model<ISubmission>('Submission', submissionSchema);
```

### Phase 3: Service Layer

#### 3.1 User Service
Create `packages/server/src/database/services/UserService.ts`:
```typescript
import { User, IUser } from '../models/User';

export class UserService {
  static async findOrCreateUser(username: string): Promise<IUser> {
    let user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) {
      user = new User({ username: username.toLowerCase() });
      await user.save();
    }
    
    return user;
  }

  static async updateLastFetched(username: string): Promise<void> {
    await User.updateOne(
      { username: username.toLowerCase() },
      { lastFetched: new Date() }
    );
  }

  static async shouldRefreshData(username: string, cacheTimeMinutes: number = 15): Promise<boolean> {
    const user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) return true;
    
    const now = new Date();
    const timeDiff = now.getTime() - user.lastFetched.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff > cacheTimeMinutes;
  }
}
```

#### 3.2 Submission Service
Create `packages/server/src/database/services/SubmissionService.ts`:
```typescript
import { Submission, ISubmission } from '../models/Submission';
import { Submission as SubmissionType } from '../../types/leetcode';

export class SubmissionService {
  static async saveSubmissions(username: string, submissions: SubmissionType[]): Promise<void> {
    const submissionDocs = submissions.map(sub => ({
      username: username.toLowerCase(),
      title: sub.title,
      titleSlug: sub.titleSlug,
      timestamp: sub.timestamp,
      statusDisplay: sub.statusDisplay,
      lang: sub.lang
    }));

    // Use insertMany with ordered: false to continue on duplicates
    try {
      await Submission.insertMany(submissionDocs, { ordered: false });
    } catch (error: any) {
      // Ignore duplicate key errors (code 11000)
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  static async getRecentSubmissions(username: string, limit: number = 20): Promise<SubmissionType[]> {
    const submissions = await Submission
      .find({ username: username.toLowerCase() })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return submissions.map(sub => ({
      title: sub.title,
      titleSlug: sub.titleSlug,
      timestamp: sub.timestamp,
      statusDisplay: sub.statusDisplay,
      lang: sub.lang
    }));
  }

  static async getSubmissionStats(username: string): Promise<{
    total: number;
    accepted: number;
    wrongAnswer: number;
    byLanguage: { [key: string]: number };
  }> {
    const submissions = await Submission.find({ username: username.toLowerCase() });
    
    const stats = {
      total: submissions.length,
      accepted: submissions.filter(s => s.statusDisplay === 'Accepted').length,
      wrongAnswer: submissions.filter(s => s.statusDisplay === 'Wrong Answer').length,
      byLanguage: {} as { [key: string]: number }
    };

    submissions.forEach(sub => {
      stats.byLanguage[sub.lang] = (stats.byLanguage[sub.lang] || 0) + 1;
    });

    return stats;
  }
}
```

### Phase 4: Enhanced LeetCode Interface

#### 4.1 Modified LeetCode Interface
Update `packages/server/src/leetInterface/index.ts`:
```typescript
import { LeetCode } from "leetcode-query";
import { UserService } from "../database/services/UserService";
import { SubmissionService } from "../database/services/SubmissionService";
import { Submission } from "../types/leetcode";

export async function GetRecentSubmissions(username: string): Promise<Submission[]> {
  try {
    // Check if we need to refresh data from LeetCode
    const shouldRefresh = await UserService.shouldRefreshData(username);
    
    if (shouldRefresh) {
      // Fetch from LeetCode API
      const leetcode = new LeetCode();
      const user = await leetcode.user(username);
      const submissions = user.recentSubmissionList;
      
      // Ensure user exists in database
      await UserService.findOrCreateUser(username);
      
      // Save submissions to database
      if (Array.isArray(submissions) && submissions.length > 0) {
        await SubmissionService.saveSubmissions(username, submissions);
      }
      
      // Update last fetched timestamp
      await UserService.updateLastFetched(username);
      
      return submissions;
    } else {
      // Return cached data from database
      return await SubmissionService.getRecentSubmissions(username);
    }
  } catch (error) {
    console.error('Error fetching submissions:', error);
    
    // Fallback to database data if API fails
    const cachedSubmissions = await SubmissionService.getRecentSubmissions(username);
    if (cachedSubmissions.length > 0) {
      return cachedSubmissions;
    }
    
    throw error;
  }
}

export async function GetSubmissionStats(username: string) {
  return await SubmissionService.getSubmissionStats(username);
}
```

### Phase 5: Update Main Server

#### 5.1 Initialize Database Connection
Update `packages/server/src/index.ts`:
```typescript
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './routers/router';
import { connectDB } from './database/connection';
import cors from 'cors';

const server = createHTTPServer({
  router: appRouter,
  middleware: cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }),
});

// Initialize database connection
const startServer = async () => {
  try {
    await connectDB();
    server.listen(3001);
    console.log('Server listening on port 3001');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  server.close();
  const { disconnectDB } = await import('./database/connection');
  await disconnectDB();
  process.exit(0);
});
```

#### 5.2 Enhanced API Endpoints
Update `packages/server/routers/userRouter.ts`:
```typescript
import { t } from '../trpc';
import { z } from 'zod';
import { GetRecentSubmissions, GetSubmissionStats } from '../leetInterface';
import { LeetCodeData } from '../types/leetcode';

export const userRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }): Promise<LeetCodeData> => {
      const submissions = await GetRecentSubmissions(input.name);
      return {
        greeting: `Hello ${input.name}!`,
        recent_submissions: Array.isArray(submissions) ? submissions : [],
      };
    }),

  stats: t.procedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      return await GetSubmissionStats(input.username);
    }),

  submissions: t.procedure
    .input(z.object({ 
      username: z.string(),
      limit: z.number().optional().default(20)
    }))
    .query(async ({ input }) => {
      return await GetRecentSubmissions(input.username);
    })
});
```

## Configuration and Deployment

### Environment Variables
```env
# Development
MONGODB_URI=mongodb://localhost:27017/gamifyleet
NODE_ENV=development

# Production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/gamifyleet
NODE_ENV=production
```

### Database Indexing
Run these commands in MongoDB shell for optimal performance:
```javascript
// Create indexes for better query performance
db.submissions.createIndex({ "username": 1, "timestamp": -1 });
db.submissions.createIndex({ "username": 1, "titleSlug": 1, "timestamp": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });
```

## Testing Strategy

### Unit Tests
Create test files in `packages/server/src/__tests__/`:
- `UserService.test.ts`
- `SubmissionService.test.ts`
- `leetInterface.test.ts`

### Integration Tests
Test the complete flow:
1. Fresh user data fetching
2. Cached data retrieval
3. API fallback scenarios
4. Database connection handling

## Migration Strategy

### Step 1: Development Setup
1. Install dependencies
2. Set up local MongoDB
3. Implement database models
4. Test with existing API

### Step 2: Gradual Rollout
1. Deploy with feature flag
2. Monitor performance
3. Validate data consistency
4. Enable caching progressively

### Step 3: Production Deployment
1. Set up production MongoDB
2. Configure environment variables
3. Monitor database performance
4. Set up backup strategy

## Performance Considerations

### Caching Strategy
- Default cache time: 15 minutes
- Configurable per environment
- Fallback to database on API failure

### Database Optimization
- Use compound indexes for queries
- Implement pagination for large datasets
- Consider TTL indexes for data cleanup

### Monitoring
- Track API response times
- Monitor database query performance
- Set up alerts for cache hit rates

## Future Enhancements

### Analytics Features
- Historical performance tracking
- Problem difficulty analysis
- Language preference trends
- Submission pattern analysis

### Gamification Elements
- Achievement system based on stored data
- Progress tracking over time
- Competitive leaderboards
- Streak tracking

### Advanced Features
- Real-time notifications
- Submission webhooks
- Data export capabilities
- Custom analytics dashboards

## Troubleshooting

### Common Issues
1. **MongoDB Connection Errors**: Check URI format and network connectivity
2. **Duplicate Key Errors**: Normal behavior, handled by service layer
3. **Cache Invalidation**: Adjust cache time based on usage patterns
4. **Memory Usage**: Monitor for large datasets, implement pagination

### Debug Commands
```bash
# Check MongoDB connection
mongosh "mongodb://localhost:27017/gamifyleet"

# View collections
db.submissions.find().limit(5)
db.users.find()

# Check indexes
db.submissions.getIndexes()
```

This implementation provides a robust foundation for MongoDB persistence while maintaining backward compatibility with the existing API.
