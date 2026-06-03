import {
  type DynamicInterventionResolver,
  type GlobalInterventionAuditConfig,
} from '@lobechat/types';

import { InterventionChecker } from '../core/InterventionChecker';
import {
  DEFAULT_SECURITY_BLACKLIST,
  DEFAULT_SECURITY_BLACKLIST_ALWAYS,
  DEFAULT_SECURITY_BLACKLIST_REQUIRED,
} from './defaultSecurityBlacklist';

export const SECURITY_BLACKLIST_AUDIT_TYPE = 'securityBlacklist';

/**
 * Create a DynamicInterventionResolver that checks security blacklist rules.
 * Reads blacklist from `metadata.securityBlacklist`, falls back to DEFAULT_SECURITY_BLACKLIST.
 */
export const createSecurityBlacklistAudit = (
  defaultSecurityBlacklist = DEFAULT_SECURITY_BLACKLIST,
): DynamicInterventionResolver => {
  return async (toolArgs: Record<string, any>, metadata?: Record<string, any>) => {
    const securityBlacklist = metadata?.securityBlacklist ?? defaultSecurityBlacklist;
    const result = InterventionChecker.checkSecurityBlacklist(securityBlacklist, toolArgs);
    return result.blocked;
  };
};

/**
 * Create the default security blacklist global audit config.
 * policy: 'always' ensures this cannot be bypassed by auto-run mode.
 */
export const createSecurityBlacklistGlobalAudit = (): GlobalInterventionAuditConfig => ({
  policy: 'always',
  resolver: createSecurityBlacklistAudit(DEFAULT_SECURITY_BLACKLIST_ALWAYS),
  type: SECURITY_BLACKLIST_AUDIT_TYPE,
});

export const createRequiredSecurityBlacklistGlobalAudit = (): GlobalInterventionAuditConfig => ({
  policy: 'required',
  resolver: createSecurityBlacklistAudit(DEFAULT_SECURITY_BLACKLIST_REQUIRED),
  type: SECURITY_BLACKLIST_AUDIT_TYPE,
});
