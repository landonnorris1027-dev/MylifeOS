import React from 'react';
import InboxPanel from '../components/InboxPanel';
import TimelinePanel from '../components/TimelinePanel';

export default function PlannerView() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-300">
      <InboxPanel />
      <TimelinePanel />
    </div>
  );
}
