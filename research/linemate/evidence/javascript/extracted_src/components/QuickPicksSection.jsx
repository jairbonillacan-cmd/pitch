import React from 'react'

function QuickPicksSection({arrayOfContent, title}) {
    return (
        <>
            <div className="my-picks-quickPicks-section">
                {title &&
                <p className="text-style-caption-uppercase-medium" style={{color: "var(--color-fig-subtle)"}}>{title}</p>
                }
                {
                    arrayOfContent.map((content, index) => (
                        <React.Fragment key={content?.key ?? index}>
                            {content}
                        </React.Fragment>
                    ))
                }
            </div>
            
        </>
    )
}

export default QuickPicksSection;