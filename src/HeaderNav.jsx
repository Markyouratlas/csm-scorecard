import React from 'react'
import {
  Crown, Plug, Lightbulb, UserMinus, DollarSign, Zap,
  LayoutDashboard, UserCircle2, Settings as SettingsIcon, LogOut, ClipboardList,
} from 'lucide-react'

// ============================================================================
//  HeaderNav — the shared right-hand navigation strip.
// ============================================================================
// Consolidates the nav cluster that is currently duplicated inline across
// ScorecardShell, SharedPagesView, ManagerView, LeadershipDashboardView,
// ApiIntegrationGuide, CsmView and FdeView.
//
// INERT as of creation: nothing imports it yet, so no rendered UI changes.
//
// This renders ONLY the right-hand button cluster (the flex row that sits at
// the right of each header). The caller still supplies the surrounding
// <header> / logo / profile chrome and passes any leading content (e.g. a
// SaveIndicator) via `children`.
//
// Visibility model (mirrors the existing headers):
//   • A nav callback that is null/undefined == "no access" == button hidden.
//   • A button still renders (active, no-op) when it represents the current
//     page, even if no callback was passed — you don't navigate to where you
//     already are.
//   • The Settings gear is hidden unless `onOpenSettings` is provided.
//   • Sign out is always rendered (required).
//
// Active treatment matches SharedPagesView's active HeaderButton: solid brand
// purple with white text; the click becomes a no-op. Leadership keeps its
// signature purple-tint accent while inactive.

const BRAND = '#6639a6'
const BRAND_ACTIVE = '#6639a6'                 // solid fill for the current page
const BRAND_SOFT = 'rgba(102, 57, 166, 0.08)'  // Leadership inactive tint

// A single nav button. `accent` gives the inactive purple tint (Leadership).
function NavButton({ active, accent, onClick, icon: Icon, label }) {
  const base = 'flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-sm'
  let className
  let style
  if (active) {
    className = `${base} text-white`
    style = { background: BRAND_ACTIVE }
  } else if (accent) {
    className = `${base} hover:opacity-80`
    style = { background: BRAND_SOFT, color: BRAND }
  } else {
    className = `${base} text-stone-600 hover:text-stone-900 hover:bg-stone-100/60`
    style = undefined
  }
  return (
    <button
      onClick={active ? undefined : onClick}
      className={className}
      style={style}
      title={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export default function HeaderNav({
  currentPage,
  onSwitchToLeadership,
  onSwitchToIntegrations,
  onSwitchToFeatureRequests,
  onSwitchToCancellations,
  onSwitchToCommissions,
  onSwitchToApiGuide,
  onSwitchToFulfillment,
  onSwitchToManager,
  onSwitchToSelf,
  onOpenSettings,
  onSignOut,
  children,
}) {
  // Fixed order. Each entry renders when it has a callback OR it is the
  // current page. `accent` flags the Leadership purple-tint variant.
  const items = [
    { page: 'leadership',       onClick: onSwitchToLeadership,      icon: Crown,           label: 'Leadership', accent: true },
    { page: 'integrations',     onClick: onSwitchToIntegrations,    icon: Plug,            label: 'Integrations' },
    { page: 'feature_requests', onClick: onSwitchToFeatureRequests, icon: Lightbulb,       label: 'Feature Requests' },
    { page: 'fulfillment',      onClick: onSwitchToFulfillment,     icon: ClipboardList,   label: 'Fulfillment' },
    { page: 'cancellations',    onClick: onSwitchToCancellations,   icon: UserMinus,       label: 'Cancellations' },
    { page: 'commissions',      onClick: onSwitchToCommissions,     icon: DollarSign,      label: 'Commissions' },
    { page: 'api_guide',        onClick: onSwitchToApiGuide,        icon: Zap,             label: 'API Setup' },
    { page: 'manager',          onClick: onSwitchToManager,         icon: LayoutDashboard, label: 'Manager view' },
    { page: 'self',             onClick: onSwitchToSelf,            icon: UserCircle2,     label: 'My scorecard' },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {children}
      {items.map(({ page, onClick, icon, label, accent }) => {
        const active = currentPage === page
        // Render only when there's a way in (callback) or it's the current page.
        if (!onClick && !active) return null
        return (
          <NavButton
            key={page}
            active={active}
            accent={accent}
            onClick={onClick}
            icon={icon}
            label={label}
          />
        )
      })}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={onSignOut}
        className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors px-3 py-2 hover:bg-stone-100 rounded-sm"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  )
}
