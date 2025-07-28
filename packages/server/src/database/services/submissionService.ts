import {
  Submission,
  ISubmission,
  SubmissionData,
  SubmissionStats,
} from "../models/submission";
import { Submission as SubmissionType } from "../../types/leetcode";

export class SubmissionService {
  static async saveSubmissions(
    userName: string,
    submissions: SubmissionType[],
  ): Promise<void> {
    const submissionDocs: SubmissionData[] = submissions.map((sub) => ({
      username: userName.toLowerCase(),
      title: sub.title,
      titleSlug: sub.titleSlug,
      timestamp: sub.timestamp,
      statusDisplay: sub.statusDisplay,
      lang: sub.lang,
    }));

    try {
      await Submission.insertMany(submissionDocs, { ordered: false });
    } catch (err: any) {
      if (err.code !== 1100) {
        //Ingnore duplicate key errors
        throw err;
      }
    }
  }
  static async getRecentSubmissions(
    userName: string,
    limit: number = 20,
  ): Promise<SubmissionType[]> {
    const submissions = await Submission.find({ username: userName })
      .sort({ timeStamp: -1 })
      .limit(limit)
      .lean();
    return submissions.map((sub) => ({
      title: sub.title,
      titleSlug: sub.titleSlug,
      timestamp: sub.timestamp,
      statusDisplay: sub.statusDisplay,
      lang: sub.lang,
    }));
  }
  static async getSubmissionStats(userName: string): Promise<SubmissionStats> {
    const submissions = await Submission.find({
      username: userName.toLowerCase(),
    });
    const stats: SubmissionStats = {
      total: submissions.length,
      accepted: submissions.filter((s) => s.statusDisplay === "Accepted")
        .length,
      wrongAnswer: submissions.filter((s) => s.statusDisplay === "Wrong Answer")
        .length,
      byLanguage: {},
    };
    submissions.map((sub) => {
      stats.byLanguage[sub.lang] = (stats.byLanguage[sub.lang] | 0) + 1;
    });
    return stats;
  }
}
