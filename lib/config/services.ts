export const SERVICE_CONFIG = {
  alyzitron: {
    name: 'Alyzitron',
    mongoCollection: process.env.ALYZITRON_MONGO_COLLECTION || 'alyzitron_analyses',
    pubsubTopic: process.env.ALYZITRON_PUBSUB_TOPIC || 'alyzitron-tasks',
    backendUrl: process.env.ALYZITRON_BACKEND_URL || 'http://localhost:8000',
  },
  editron: {
    name: 'Editron',
    mongoCollection: process.env.EDITRON_MONGO_TASKS_COLLECTION || 'editron_autoshorts_tasks',
    pubsubTopic: process.env.EDITRON_PUBSUB_TOPIC || 'editron-tasks',
    backendUrl: process.env.EDITRON_BACKEND_URL || 'http://localhost:8080',
  },
  musitron: {
    name: 'Musitron',
    mongoCollection: process.env.MUSITRON_MONGO_COLLECTION || 'musitron_tracks',
    pubsubTopic: process.env.MUSITRON_PUBSUB_TOPIC || 'musitron-tasks',
    backendUrl: process.env.MUSITRON_BACKEND_URL || 'http://localhost:8081',
  },
  shield: {
    name: 'Shield',
    mongoCollection: process.env.SHIELD_MONGO_COLLECTION || 'shield_scans',
    pubsubTopic: process.env.SHIELD_PUBSUB_TOPIC || 'shield-tasks',
    backendUrl: process.env.SHIELD_BACKEND_URL || 'http://localhost:8082',
  },
  thinkforge: {
    name: 'ThinkForge',
    mongoCollection: process.env.THINKFORGE_MONGO_COLLECTION || 'thinkforge_chats',
    pubsubTopic: process.env.THINKFORGE_PUBSUB_TOPIC || 'thinkforge-tasks',
    backendUrl: process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8083',
  },
  socialize: {
    name: 'Socialize',
    mongoCollection: process.env.SOCIALIZE_MONGO_COLLECTION || 'socialize_profiles',
    pubsubTopic: process.env.SOCIALIZE_PUBSUB_TOPIC || 'socialize-tasks',
    backendUrl: process.env.SOCIALIZE_BACKEND_URL || 'http://localhost:8084',
  },
  clickatron: {
    name: 'Clickatron',
    mongoCollection: process.env.CLICKATRON_MONGO_COLLECTION || 'thumbnailgen_tasks',
    pubsubTopic: process.env.CLICKATRON_PUBSUB_TOPIC || 'clickatron-tasks',
    backendUrl: process.env.CLICKATRON_BACKEND_URL || 'http://localhost:8085',
  },
} as const;

export type ServiceName = keyof typeof SERVICE_CONFIG;

export function getServiceConfig(serviceName: ServiceName) {
  return SERVICE_CONFIG[serviceName];
}