import { UserService } from "../database/services/UserService.ts"
import { SubmissionService } from "../database/services/submissionService.ts"
import type { Submission } from "../types/leetcode.ts";
import { LeetCode } from "leetcode-query";

export async function GetRecentSubmissions(username: string): Promise<Submission[]> {
	try {
		const shouldReferesh = await UserService.shouldRefreshData(username)
		if (shouldReferesh) {
			const leetcode = new LeetCode();
			const user = await leetcode.user(username);
			const submissions = user.recentSubmissionList;

			await UserService.findOrCreateUser(username)

			if (Array.isArray(submissions) && submissions.length > 0) {
				await SubmissionService.saveSubmissions(username, submissions);
			}

			await UserService.updateLastFetched(username)
			if (submissions === null) {
				return []
			}
			return submissions;
		} else {
			return await SubmissionService.getRecentSubmissions(username)
		}
	} catch (error) {
		console.error('Error featching submissions:', error)

		const cachedSubmissions = await SubmissionService.getRecentSubmissions(username)
		if (cachedSubmissions.length > 0) {
			return cachedSubmissions;
		}
		throw error;
	}
}

export async function GetSubmissionStats(username: string) {
	return await SubmissionService.getSubmissionStats(username);
}
