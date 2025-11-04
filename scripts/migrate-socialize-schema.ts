import mongoose from "mongoose";
// Use explicit file extensions for ESM resolution when running under the
// ts-node ESM loader. Node's ESM loader requires file extensions for local
// imports (unless experimental specifier resolution is enabled).
import Socialize from "../schemas/Socialize.ts";
import connectToDatabase from "../schemas/ConnectToDatabase.ts";

const migrateSocializeSchema = async () => {
  try {
    console.log("Connecting to the database...");
    await connectToDatabase();
    console.log("Database connected.");

    const defaultBanner = {
      type: 'color',
      value: '#0e6b9c',
      gradientType: 'linear',
      gradientColors: [],
    };

    console.log("Migrating banner and notifications array fields...");
    const result = await Socialize.updateMany(
      {
        $or: [
          { banner: { $exists: false } },
          { notifications: { $exists: false } }
        ]
      },
      {
        $set: {
          banner: defaultBanner,
          notifications: []
        }
      }
    );

    console.log(`Banner/notifications migration complete. Matched ${result.matchedCount} documents and modified ${result.modifiedCount} documents.`);

    // Migrate existing notifications to include timestamp and expiresAt
    console.log("Migrating existing notifications to add timestamp and expiresAt fields...");
    
    // Get all documents with notifications
    const documents = await Socialize.find({
      notifications: { $exists: true, $ne: [] }
    });

    let updatedCount = 0;
    for (const doc of documents) {
      let needsUpdate = false;
      const updatedNotifications = doc.notifications.map((notification: any) => {
        if (!notification.timestamp || !notification.expiresAt) {
          needsUpdate = true;
          return {
            ...notification,
            timestamp: notification.timestamp || new Date().toISOString(),
            expiresAt: notification.expiresAt || (notification.duration ?
              new Date(Date.now() + notification.duration * 60 * 60 * 1000).toISOString() : undefined)
          };
        }
        return notification;
      });

      if (needsUpdate) {
        await Socialize.updateOne(
          { _id: doc._id },
          { $set: { notifications: updatedNotifications } }
        );
        updatedCount++;
      }
    }

    console.log(`Notification fields migration complete. Updated ${updatedCount} documents with new notification fields.`);

  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
};

migrateSocializeSchema();