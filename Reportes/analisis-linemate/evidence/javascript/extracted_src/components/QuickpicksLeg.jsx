import './QuickpicksLeg.scss'

function QuickpicksLeg({
  label,
  hitRateLine,
  betTypeLabel,
  disabled,
  selected,
  onClick,
  formattedOdds,
  bookName,
  header
}) {
  const className = [
    disabled ? 'my-picks-trends-line-disabled' : 'my-picks-trends-line',
    selected ? 'my-picks-trends-line-selected' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      <div className='my-picks-leg-info'>
        {header && <p className='text-style-label-medium'>{header}</p>}
        <p className={header ? 'text-style-caption-medium' : 'text-style-label-medium'}>{`${label} ${hitRateLine ? hitRateLine : ''} ${betTypeLabel ? betTypeLabel : ''}`}</p>
      </div>
      {formattedOdds != null && bookName ? (
        <div className="my-picks-trends-line-odd-logo">
          <p className="text-style-label-semibold color-fig-subtle">{formattedOdds}</p>
          <img src={`assets/sportsbooks/${bookName}.svg`} alt="" />
        </div>
      ) : (
        <div>
          <p className="color-fig-subtle">---</p>
        </div>
      )}
    </div>
  )
}

export default QuickpicksLeg
