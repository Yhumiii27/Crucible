// Phosphor icons of the screens (kept out of ./screens.ts so that server code and scripts load the registry without React).
import type { Icon } from '@phosphor-icons/react';
import {
  Bell, Buildings, CheckSquareOffset, CalendarBlank, CalendarCheck, ChartBar, ClipboardText, Flask, GearSix, House, Lightning, ListChecks, PlugsConnected, RocketLaunch, Scales,
  ShieldCheck, Stack, TrendUp, UsersThree,
} from '@phosphor-icons/react/dist/ssr';
import type { ScreenId } from './screens';

export const SCREEN_ICONS: Record<ScreenId, Icon> = {
  home: House,
  notifications: Bell,
  'my-schedule': CalendarCheck,
  'my-needs': ClipboardText,
  decide: CheckSquareOffset,
  planning: CalendarBlank,
  load: TrendUp,
  propose: ListChecks,
  conflicts: Scales,
  incidents: Lightning,
  facilities: Flask,
  facility: Flask,
  projects: Stack,
  project: Stack,
  people: UsersThree,
  rules: ShieldCheck,
  dashboard: ChartBar,
  pilot: RocketLaunch,
  'admin-org': Buildings,
  'admin-users': UsersThree,
  'admin-connectors': PlugsConnected,
};

export const ADMIN_ICON = GearSix;
