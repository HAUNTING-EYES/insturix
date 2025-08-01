export const SERVICE_CONFIG = {
  alyzitron: {
    name: 'Alyzitron',
    mongoCollection: process.env.ALYZITRON_MONGO_COLLECTION || 'alyzitron_tasks',
  },
  editron: {
    name: 'Editron',
    mongoCollection: process.env.EDITRON_MONGO_TASKS_COLLECTION || 'editron_autoshorts_tasks',
  },
  musitron: {
    name: 'Musitron',
    mongoCollection: process.env.MUSITRON_MONGO_COLLECTION || 'musitron_tasks',
  },
  shield: {
    name: 'Shield',
    mongoCollection: process.env.SHIELD_MONGO_COLLECTION || 'shield_scans',
  },
  thinkforge: {
    name: 'ThinkForge',
    mongoCollection: process.env.THINKFORGE_MONGO_COLLECTION || 'thinkforge_chats',
  },
  socialize: {
    name: 'Socialize',
    mongoCollection: process.env.SOCIALIZE_MONGO_COLLECTION || 'socialize_profiles',
  },
  clickatron: {
    name: 'Clickatron',
    mongoCollection: process.env.CLICKATRON_MONGO_COLLECTION || 'clickatron_tasks',
  },
} as const;

export type ServiceName = keyof typeof SERVICE_CONFIG;

export function getServiceConfig(serviceName: ServiceName) {
  return SERVICE_CONFIG[serviceName];
}