export const SERVICE_CONFIG = {
  alyzitron: {
    name: 'Alyzitron',
    mongoCollection: process.env.ALYZITRON_MONGO_COLLECTION || 'alyzitron_analyses',
    pubsubTopic: process.env.ALYZITRON_PUBSUB_TOPIC || 'alyzitron-tasks',
  },
  editron: {
    name: 'Editron',
    mongoCollection: process.env.EDITRON_MONGO_TASKS_COLLECTION || 'editron_autoshorts_tasks',
    pubsubTopic: process.env.EDITRON_PUBSUB_TOPIC || 'editron-tasks',
  },
  musitron: {
    name: 'Musitron',
    mongoCollection: process.env.MUSITRON_MONGO_COLLECTION || 'musitron_tracks',
    pubsubTopic: process.env.MUSITRON_PUBSUB_TOPIC || 'musitron-tasks',
  },
  shield: {
    name: 'Shield',
    mongoCollection: process.env.SHIELD_MONGO_COLLECTION || 'shield_scans',
    pubsubTopic: process.env.SHIELD_PUBSUB_TOPIC || 'shield-tasks',
  },
  thinkforge: {
    name: 'ThinkForge',
    mongoCollection: process.env.THINKFORGE_MONGO_COLLECTION || 'thinkforge_chats',
    pubsubTopic: process.env.THINKFORGE_PUBSUB_TOPIC || 'thinkforge-tasks',
  },
  socialize: {
    name: 'Socialize',
    mongoCollection: process.env.SOCIALIZE_MONGO_COLLECTION || 'socialize_profiles',
    pubsubTopic: process.env.SOCIALIZE_PUBSUB_TOPIC || 'socialize-tasks',
  },
  clickatron: {
    name: 'Clickatron',
    mongoCollection: process.env.CLICKATRON_MONGO_COLLECTION || 'thumbnailgen_tasks',
    pubsubTopic: process.env.CLICKATRON_PUBSUB_TOPIC || 'clickatron-tasks',
  },
} as const;

export type ServiceName = keyof typeof SERVICE_CONFIG;

export function getServiceConfig(serviceName: ServiceName) {
  return SERVICE_CONFIG[serviceName];
}