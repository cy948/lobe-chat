import { type GlobalInterventionAuditConfig } from '@lobechat/types';

import {
  createRequiredSecurityBlacklistGlobalAudit,
  createSecurityBlacklistGlobalAudit,
} from './createSecurityBlacklistAudit';

export const createDefaultGlobalAudits = (): GlobalInterventionAuditConfig[] => [
  createSecurityBlacklistGlobalAudit(),
  createRequiredSecurityBlacklistGlobalAudit(),
];
