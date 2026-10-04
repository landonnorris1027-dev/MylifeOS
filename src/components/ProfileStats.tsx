import React from 'react';
import { isAndroid } from '../services/platform';
import AndroidProfileStats from './AndroidProfileStats';
import DesktopFocusStats from './DesktopFocusStats';
export default function ProfileStats(props: { refreshToken?: number }) {
  return isAndroid() ? <AndroidProfileStats {...props} /> : <DesktopFocusStats {...props} />;
}
