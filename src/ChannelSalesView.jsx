import React from 'react'
import ScorecardShell from './ScorecardShell'
import { ChannelPartnerDeals } from './AeView'

// Focused scorecard for channel salespeople (e.g. Omer, who works Sandler-sourced deals).
// Reuses the ChannelPartnerDeals component, which scopes to the logged-in user's ASSIGNED
// deals (channel_deals.assigned_to = their Atlas email), with a Super-Admin "all deals"
// toggle and the in-app dialer. No AE meeting funnel — just their channel pipeline.
export default function ChannelSalesView({
  profile, onSignOut,
  onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations,
  onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onSwitchToCommissions,
  onProfileUpdated,
}) {
  const shellNav = {
    onSwitchToManager, onSwitchToFeatureRequests, onSwitchToIntegrations,
    onSwitchToCancellations, onSwitchToApiGuide, onSwitchToLeadership, onSwitchToCommissions,
    onProfileUpdated,
  }
  return (
    <ScorecardShell
      profile={profile} onSignOut={onSignOut} {...shellNav} hideWeekNav
      title="Channel Sales" subtitle="Your assigned channel-partner deals">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <ChannelPartnerDeals profile={profile} />
      </div>
    </ScorecardShell>
  )
}
