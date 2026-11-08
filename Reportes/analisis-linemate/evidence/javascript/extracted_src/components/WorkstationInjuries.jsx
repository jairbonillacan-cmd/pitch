import { useState, useEffect, useContext } from 'react'
import Table from './Table';
import SegmentedControl from './SegmentedControl';
import "./WorkstationInjuries.scss"
import { getTeamIdByCode, getTeamLogoPath } from '../react-web-utils';
import { API_HOST } from '../react-web-constants';
import { getPlayerName, jsonOrDefault } from '../linemate-react-common/src/util';
import GlobalContext from './GlobalContext';

function WorkstationInjuries({teamCode, opposingTeamCode, leagueOverride}) {

    const segmentOptions = {
        [teamCode]: teamCode,
        [opposingTeamCode]: opposingTeamCode
    }

    const context = useContext(GlobalContext);

    const effectiveLeague = leagueOverride || context.league

    const [teamInjuries, setTeamInjuries] = useState()
    const [opposingTeamInjuries, setOpposingTeamInjuries] = useState()
    const [selectedTeam, setSelectedTeam] = useState(segmentOptions[teamCode])
    const [tableData, setTableData] = useState()

    const hasEitherTeamInjuries = (teamInjuries && teamInjuries.length > 0) || (opposingTeamInjuries && opposingTeamInjuries.length > 0)

    useEffect(() => {
        Promise.all([
            fetch(`${API_HOST}/api/${effectiveLeague}/v3/teams/${teamCode}/injuries`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${effectiveLeague}/v3/teams/${opposingTeamCode}/injuries`).then((response) => jsonOrDefault(response, [])),
        ])
        .then((results) => {
            setTeamInjuries(results[0])
            setOpposingTeamInjuries(results[1])

            if (results[0].length > 0) {
                setSelectedTeam(segmentOptions[teamCode])
                setTableData(results[0])
            } else if (results[1].length > 0) {
                setSelectedTeam(segmentOptions[opposingTeamCode])
                setTableData(results[1])
            } else {
                setSelectedTeam(segmentOptions[teamCode])
                setTableData([])
            }
        })
    }, [])

    const sampleInjuries = [
        {team: 'SJS', name: "C. Price", position: "G", injury: "Knee", status: "IR-LT"},
        {team: 'SJS', name: "L. Couture", position: "G", injury: "Groin", status: "IR"},
        {team: 'SJS', name: "R. Ellis", position: "D", injury: "Back", status: "IR"},
        {team: 'SJS', name: "V. Desharnes", position: "D", injury: "Upper-body", status: "IR"},
        {team: 'SJS', name: "L. Couture", position: "G", injury: "Groin", status: "IR"},
        {team: 'SJS', name: "R. Ellis", position: "D", injury: "Back", status: "IR"},
        {team: 'SJS', name: "V. Desharnes", position: "D", injury: "Upper-body", status: "IR"},
    ]

    const sampleInjuries2 = [
        {team: 'ANA', name: "E. Nguyen", position: "G", injury: "Knee", status: "IR-LT"},
        {team: 'ANA', name: "J. Smith", position: "G", injury: "Arm", status: "IR-LT"},
        {team: 'ANA', name: "S. Blake", position: "D", injury: "Back", status: "IR"},
        {team: 'ANA', name: "P. Romain", position: "D", injury: "Upper-body", status: "IR"},
    ]

    const handleTeamSwap = (teamSelected) => {
        setSelectedTeam(teamSelected)
        if (teamSelected == segmentOptions[teamCode]) {
            setTableData(teamInjuries)
        } else {
            setTableData(opposingTeamInjuries)
        }
    }

    if (!hasEitherTeamInjuries) {
        return null
    }

    return (
        <>
            <div className='workstation-injuries-header'>
                <p className='text-style-h-3-medium color-fig-default'>Injuries</p>
                <SegmentedControl
                    options={segmentOptions}
                    selection={selectedTeam}
                    selectionHandler={(teamSelected) => handleTeamSwap(teamSelected)}
                    fillWidth={false}
                />
            </div>
            {tableData && tableData.length > 0 &&
                <Table 
                    className="trends-workstation-injuries-table"
                    columns={["PLAYER", "POSITION", "INJURY", "STATUS"]}
                    rowCount={tableData.length}
                    columnStyling={(columnIndex, columnName) => {
                    if (columnIndex === 0) {
                    return { width: '25%', textAlign: 'left', padding: '12px', borderTopLeftRadius: '8px' }
                    }
                    if (columnIndex === 1) {
                    return { width: '25%', textAlign: 'left', padding: '18px' }
                    }
                    if (columnIndex === 2) {
                    return { width: '25%', textAlign: 'left', padding: '18px' }
                    }
                    if (columnIndex === 3) {
                        return { width: '25%', textAlign: 'left', padding: '18px', borderTopRightRadius: '8px'}
                    }
                }}
                dataExtractor={(rowIndex, columnIndex, columnName) => {
                if (columnIndex == 0) {
                    return (
                    <div style={{display: "flex", flexDirection: "row", gap: "4px", alignItems: "center"}}>
                        <div>
                        <img src={getTeamLogoPath(effectiveLeague, tableData[rowIndex].teamId || getTeamIdByCode(context.teams, tableData[rowIndex].teamCode))} />
                        </div>
                        <p>{getPlayerName(tableData[rowIndex])}</p>
                    </div>)
                }
                if (columnIndex == 1) {
                    return tableData[rowIndex].position
                }
                if (columnIndex == 2) {
                    return tableData[rowIndex].injury
                }
                if (columnIndex == 3) {
                    return tableData[rowIndex].status
                }
                }}
                />
            }
        </>
    )
}

export default WorkstationInjuries;
