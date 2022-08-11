import { InteractiveTableSettings } from 'components/InteractiveTable';
import { BaseType, SettingsConfig } from 'hooks/useSettings';

export interface CompareTableSettings extends InteractiveTableSettings {
  archived?: boolean;
  columns: string[];
  label?: string[];
  row?: number[];
  search?: string;
  sortKey: string;
  user?: string[];
}

const config: SettingsConfig = {
  applicableRoutespace: '/trials',
  settings: [

    {
      defaultValue: [],
      key: 'columns',
      skipUrlEncoding: true,
      storageKey: 'columns',
      type: {
        baseType: BaseType.String,
        isArray: true,
      },
    },
    {
      defaultValue: [],
      key: 'columnWidths',
      skipUrlEncoding: true,
      storageKey: 'columnWidths',
      type: {
        baseType: BaseType.Float,
        isArray: true,
      },

    },
    {
      key: 'row',
      type: { baseType: BaseType.Integer, isArray: true },
    },

  ],
  storagePath: 'trial-table',
};

export default config;
