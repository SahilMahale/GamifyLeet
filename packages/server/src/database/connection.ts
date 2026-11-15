import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const DB_URL = process.env.MONGODB_URI;

export const connectDB = async (): Promise<void> => {
  if (DB_URL === "" || DB_URL === undefined) {
    throw new Error("MONGODB_URI is not set");
  }
  try {
    await mongoose.connect(DB_URL);
    console.log("Connected to MongoDb SuccessFully");
  } catch (error) {
    console.error("Error connecting to the DB:", error);
    throw error;
  }
};
export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log("Disconnected to MongoDb SuccessFully");
  } catch (error) {
    console.error("Error disconnecting to the DB:", error);
    throw error;
  }
};
