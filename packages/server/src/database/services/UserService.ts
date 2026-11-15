import { type IUser, User } from "../models/users";

export class UserService {
	static async findOrCreateUser(userName: string): Promise<IUser> {
		let userData = await User.findOne({ username: userName.toLowerCase() });
		if (!userData) {
			userData = new User({ username: userName.toLowerCase() });
			await userData.save();
		}
		return userData;
	}
	static async updateLastFetched(userName: string): Promise<void> {
		await User.updateOne(
			{ username: userName.toLowerCase() },
			{ lastFetched: new Date(), updatedAt: new Date() },
		);
	}
	static async shouldRefreshData(
		userName: string,
		cacheTimeMinutes: number = 15,
	): Promise<boolean> {
		const userData = await User.findOne({ username: userName.toLowerCase() });
		if (!userData) {
			return true;
		}
		const now = new Date();
		const timeDiffMinutes =
			(now.getTime() - userData.lastFetched.getTime()) / (1000 * 60);
		return timeDiffMinutes > cacheTimeMinutes;
	}
}
