import './DetailPageTabs.scss'

function DetailPageTabs({ tabs, activeTab, onTabClick }) {
  const normalizedTabs = tabs.map((tab) =>
    typeof tab === 'string' ? { key: tab, label: tab } : tab
  )
  const effectiveActive =
    activeTab != null && normalizedTabs.some((tab) => tab.key === activeTab)
      ? activeTab
      : normalizedTabs[0]?.key

  return (
    <div className='detail-tab-container'>
      {normalizedTabs.map((tab) => (
        <div
          key={tab.key}
          className={`detail-tab-individual-container ${effectiveActive === tab.key ? 'detail-tab-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onTabClick?.(tab.key)}
          onKeyDown={(e) => e.key === 'Enter' && onTabClick?.(tab.key)}
        >
          <div className='detail-tab-individual-inner-wrapper text-style-label-medium'>
            <span>{tab.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default DetailPageTabs