import type { AutoResponderRule } from '../src/shared/types.ts';
import { botStore } from './stateStore.ts';

export interface AutoResponderMatchResult {
  matched: boolean;
  replyText?: string;
  ruleId?: string;
  trigger?: string;
}

export function evaluateAutoResponder(
  text: string,
  context: {
    isGroup: boolean;
    senderPhone: string;
    senderName?: string;
    groupName?: string;
  }
): AutoResponderMatchResult {
  const rules = botStore.config.autoResponder || [];
  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Check scope
    if (rule.scope === 'private_only' && context.isGroup) continue;
    if (rule.scope === 'group_only' && !context.isGroup) continue;

    let isMatch = false;
    const ruleTrigger = rule.trigger.trim();
    const ruleLower = ruleTrigger.toLowerCase();

    if (rule.matchType === 'exact') {
      isMatch = lower === ruleLower;
    } else if (rule.matchType === 'contains') {
      isMatch = lower.includes(ruleLower);
    } else if (rule.matchType === 'regex') {
      try {
        const re = new RegExp(ruleTrigger, 'i');
        isMatch = re.test(normalized);
      } catch {
        isMatch = false;
      }
    }

    if (isMatch) {
      // Increment hit count
      rule.hitCount = (rule.hitCount || 0) + 1;
      botStore.saveToDisk();
      botStore.broadcast('config:update', botStore.config);

      // Render variables
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')} WIB`;

      let reply = rule.replyText
        .replace(/\{sender\}/gi, `@${context.senderPhone}`)
        .replace(/\{senderName\}/gi, context.senderName || context.senderPhone)
        .replace(/\{botName\}/gi, botStore.config.botName)
        .replace(/\{prefix\}/gi, botStore.config.prefix)
        .replace(/\{groupName\}/gi, context.groupName || 'Grup WhatsApp')
        .replace(/\{time\}/gi, timeStr);

      return {
        matched: true,
        replyText: reply,
        ruleId: rule.id,
        trigger: rule.trigger,
      };
    }
  }

  return { matched: false };
}
