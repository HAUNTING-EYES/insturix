import { PubSub } from '@google-cloud/pubsub';
import { getServiceConfig } from '@/lib/config/services';
import { logger } from './logger';

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcsCredentials) {
  throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set for Pub/Sub');
}

const pubsub = new PubSub({
  projectId: gcsCredentials.project_id,
  credentials: gcsCredentials,
});

export interface TaskMessage {
  analysisId: string; // Changed from taskId to analysisId
  userId: string;
  videoUrl: string;
  additionalDetails?: string;
}

export class PubSubManager {
  private static getTopicName(): string {
    return getServiceConfig('alyzitron').pubsubTopic;
  }

  static async publishTask(message: TaskMessage): Promise<void> {
    try {
      const topicName = this.getTopicName();
      const messageData = JSON.stringify(message);
      
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(messageData),
      });

      logger.info('Task published to Pub/Sub', { 
        data: {
          topic: topicName,
          analysisId: message.analysisId, // Changed from taskId to analysisId
          userId: message.userId
        }
      });
    } catch (error) {
      logger.error('Failed to publish task to Pub/Sub', { 
        data: {
          analysisId: message.analysisId, // Changed from taskId to analysisId
          userId: message.userId,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }
}