import './NewHorizontalComparisonBar.scss'

function NewHorizontalComparisonBar({leftValueRaw, rightValueRaw, leftColorHex, rightColorHex, showPercentage, text}) {
    const leftValue = Number(leftValueRaw);
    const rightValue = Number(rightValueRaw);
    const leftPercentage = (leftValue / (leftValue + rightValue)) * 100;
    const rightPercentage = (rightValue / (leftValue + rightValue)) * 100;

    let leftText;
    let rightText;
    if (showPercentage) {
      leftText = leftPercentage.toFixed(1) + '%';
      rightText = rightPercentage.toFixed(1) + '%';
    } else {
      leftText = leftValueRaw;
      rightText = rightValueRaw;
    }

    const leftStyling = {
      width: (leftPercentage) + '%',
      background: leftColorHex,
    }
    const rightStyling = {
      width: (rightPercentage) + '%',
      background: rightColorHex,
    }

    
    return (
        <>
            <div className='horizontal-comparison-bar-wrapper'>
                <div className='horizontal-comparison-bar-text-wrapper'>
                    <p className="text-style-label-medium" style={{textAlign: 'left'}}>{leftText}</p>
                    <p className="text-style-label-normal" style={{textAlign: 'center'}}>{text}</p>
                    <p className="text-style-label-medium" style={{textAlign: 'right'}}>{rightText}</p>
                </div>
                <div className="odd-graph">
                    <div className='horizontal-comparison-bar-graph' style={leftStyling}></div>
                    <div className='horizontal-comparison-bar-graph' style={rightStyling}></div>
                </div>
            </div>
        </>
    )
}

export default NewHorizontalComparisonBar