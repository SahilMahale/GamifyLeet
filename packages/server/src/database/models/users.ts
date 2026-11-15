import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  username: string;
  createdAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
  lastFetched: Date;
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastFetched: {
    type: Date,
    default: Date.now,
  },
});
//set updatedAt for the date when a field is updated
userSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const User = mongoose.model<IUser>("User", userSchema);
