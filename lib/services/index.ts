// Unified task failure handling
export { handleTaskFailure } from './tasks/handle-failure';

// Unified service interfaces and configuration
export { 
  getServiceConfig, 
  serviceLogger,
  type TaskService,
  type RTDBService,
  type ServiceConfig 
} from './common/task-service';

// Individual service implementations
export { AlyzitronTaskService } from './common/services/alyzitron-task-service';
export { ClickatronTaskService } from './common/services/clickatron-task-service';
export { AlyzitronRTDBService } from './common/services/alyzitron-rtdb-service';
export { ClickatronRTDBService } from './common/services/clickatron-rtdb-service';
export { alyzitronAdditionalRefund } from './common/services/alyzitron-additional-refund';

// RTDB managers
export { AlyzitronRTDBManager } from './rtdb/alyzitron-rtdb';
export { ClickatronRTDBManager } from './rtdb/clickatron-rtdb';