import type {LogDefRecord, StringRecord} from '@appium/types';
import type {WindowsDriver} from '../driver';
import {isEmpty} from '../utils';

const COLOR_CODE_PATTERN = /\u001b\[(\d+(;\d+)*)?m/g; // eslint-disable-line no-control-regex
const GET_SERVER_LOGS_FEATURE = 'get_server_logs';
const DEFAULT_LOG_LEVEL = 'ALL';

export const supportedLogTypes: LogDefRecord = {
  server: {
    description: 'Appium server logs',
    getter: (self: WindowsDriver): LogEntry[] => {
      self.assertFeatureEnabled(GET_SERVER_LOGS_FEATURE);
      return self.log.unwrap().record.map(nativeLogEntryToSeleniumEntry);
    },
  },
};

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
}

function nativeLogEntryToSeleniumEntry(x: StringRecord): LogEntry {
  const msg = isEmpty(x.prefix) ? x.message : `[${x.prefix}] ${x.message}`;
  return toLogEntry(msg.replace(COLOR_CODE_PATTERN, ''), x.timestamp ?? Date.now());
}

function toLogEntry(
  message: string,
  timestamp: number,
  level: string = DEFAULT_LOG_LEVEL,
): LogEntry {
  return {timestamp, level, message};
}
