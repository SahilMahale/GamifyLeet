import mongoose from "mongoose";
import dotenv from "dotenv";
import { error } from "node:console";

dotenv.config();

const DB_URL = process.env.MONGODB_URI;

export const connectDB = async (): Promise<void> => {
  if (DB_URL === "" || DB_URL === undefined) {
    throw error("DB_URL not correct");
  }
  try {
    await mongoose.connect(DB_URL);
    console.log("Connected to MongoDb SuccessFully");
  } catch (error) {
    console.error("Error connecting to the DB:", error);
    throw error("Error connecting to the DB:", error);
  }
};
export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log("Disconnected to MongoDb SuccessFully");
  } catch (error) {
    console.error("Error disconnecting to the DB:", error);
    throw error("Error disconnecting to the DB:", error);
  }
};
