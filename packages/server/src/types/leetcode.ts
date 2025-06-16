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

// Since GetRecentSubmissions returns Submission[] directly
export type GetRecentSubmissionsResponse = Submission[];
