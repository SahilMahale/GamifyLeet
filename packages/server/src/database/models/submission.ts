import mongoose, { Schema, Document } from "mongoose";

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
export type SubmissionData = Omit<
  ISubmission,
  keyof Document | "createdAt" | "updatedAt"
>;

export type SubmissionStats = {
  total: number;
  accepted: number;
  wrongAnswer: number;
  byLanguage: { [key: string]: number };
};

const submissionSchema = new Schema<ISubmission>({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  title: { type: String, required: true },
  titleSlug: { type: String, required: true },
  timestamp: { type: String, required: true },
  statusDisplay: { type: String, required: true },
  lang: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

//First Index: Query optimization of frequently used Finds on this kind of data
submissionSchema.index({ username: 1, timestamp: -1 });
//Secondary Index: Data integrity and race condition avoidance
submissionSchema.index(
  { username: 1, titleSlug: 1, timestamp: 1 },
  { unique: true },
);

export const Submission = mongoose.model<ISubmission>(
  "Submission",
  submissionSchema,
);
