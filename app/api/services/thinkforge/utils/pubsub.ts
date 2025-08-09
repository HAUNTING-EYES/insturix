import { PubSub } from '@google-cloud/pubsub';
import { getServiceConfig } from '@/lib/config/services';

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

export interface ThinkForgeTaskMessage {
  taskId: string;
  userId: string;
  sessionId: string;
  type: 'chat' | 'ideas' | 'scripts' | 'suggestions';
  data: {
    message?: string;
    prompt?: string;
    selectedIdea?: any;
    chatHistory?: any[];
    context?: any;
    preferences?: any;
  };
}

export class ThinkForgePubSubManager {
  private static getTopicName(): string {
    return getServiceConfig('thinkforge').pubsubTopic;
  }

  static async publishTask(message: ThinkForgeTaskMessage): Promise<void> {
    try {
      const topicName = this.getTopicName();
      const messageData = JSON.stringify(message);
      
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(messageData),
      });

      console.info('ThinkForge task published to Pub/Sub', { 
        data: { 
          topic: topicName, 
          taskId: message.taskId, 
          userId: message.userId,
          type: message.type
        } 
      });
    } catch (error) {
      console.error('Failed to publish ThinkForge task to Pub/Sub', { 
        data: { 
          taskId: message.taskId, 
          userId: message.userId,
          error: error instanceof Error ? error.message : String(error) 
        } 
      });
      throw error;
    }
  }

  static async cancelTask(taskId: string, userId: string, sessionId: string): Promise<void> {
    try {
      const topicName = this.getTopicName();
      const cancelMessage = {
        action: 'CANCEL',
        taskId,
        userId,
        sessionId,
      };
      
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(JSON.stringify(cancelMessage)),
      });

      console.info('ThinkForge task cancellation published to Pub/Sub', { 
        data: { 
          topic: topicName, 
          taskId, 
          userId 
        } 
      });
    } catch (error) {
      console.error('Failed to publish ThinkForge task cancellation to Pub/Sub', { 
        data: { 
          taskId, 
          userId,
          error: error instanceof Error ? error.message : String(error) 
        } 
      });
      throw error;
    }
  }
} 