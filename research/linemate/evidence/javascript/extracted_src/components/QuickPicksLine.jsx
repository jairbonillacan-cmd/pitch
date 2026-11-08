import "./QuickPicksLine.scss"

function QuickPicksLine({header, value, clickFunction, preexisting, book}) {
    return(
        <>
            <div onClick={clickFunction} className={preexisting ? "my-picks-quickPicks-line-active my-picks-quickPicks-individual" : "my-picks-quickPicks-individual"}>
                <p className="text-style-label-uppercase-medium">{header}</p>
                <div className="my-picks-quickPicks-line-right">
                    <p className="text-style-label-semibold" style={{color: "var(--color-fig-subtle)"}}>{value}</p>
                    <img src={`/assets/sportsbooks/${book}.svg`} />
                </div>
                
            </div>
        </>
    )
}

export default QuickPicksLine;