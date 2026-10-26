import React from 'react';
import DesktopFocusStats from './DesktopFocusStats';
export default function ProfileStats(props: { refreshToken?: number }) {
  return <DesktopFocusStats {...props} />;
}
