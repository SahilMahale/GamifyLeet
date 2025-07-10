import { LeetCode } from "leetcode-query";

export async function GetRecentSubmissions(username: string): Promise<any> {
  const leetcode = new LeetCode();
  const user = await leetcode.user(username);
  return user.recentSubmissionList;
}
