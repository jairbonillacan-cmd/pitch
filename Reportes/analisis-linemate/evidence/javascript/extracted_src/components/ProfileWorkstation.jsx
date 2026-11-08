import React from 'react';

import '../components/App.scss'
import _ from 'lodash';
import { WITH_FILTER, WITHOUT_FILTER } from '../linemate-react-common/src/constants';
import TrendsWorkstation from './TrendsWorkstation';
import { fetchPlayerRecord, getPlayerName } from '../linemate-react-common/src/util';
import { API_HOST } from '../react-web-constants';
import GlobalContext from './GlobalContext';
import i18n from '../i18n';

class ProfileWorkstation extends React.Component {

    static contextType = GlobalContext;

    constructor(props) {
        super(props)

        this.state = {
            player: null
        }
    }

    componentDidMount() {
        document.title = `${i18n.t('preferences.items.profile')} - Linemate`;
        // We are fetching it twice, once here and once later in trends workstation but we don't have much of a choice without refactoring some of the generic workstation code
        fetchPlayerRecord(API_HOST, this.context.league, this.props.playerId, false)
        .then(response => this.setState({player: response}))
        .catch(console.error)
    }

    /**
     * 
        Either make all lines 0 or make graph/hit rates reflect the pre-filled line
     */
    render() {
        if (!this.state.player) {
            return (<></>)
        }
        return (
            <>
                <div className='trends-page-details-title trends-page-details-title-mobile'>
                    <p className='text-style-h-4-semibold color-fig-default'>{getPlayerName(this.state.player)} - {this.props.teamCode}</p>
                </div>
                <TrendsWorkstation 
                    type={'player'}
                    // This needs to be null. Any non-null value will assume there's a game and try to fetch opposing pitcher for mlb
                    gameId={null}
                    team={{code: this.props.teamCode}}
                    opposingTeam={null}
                    markets={{}}
                    initialMarket={null}
                    player={this.state.player.info}
                    backAction={null}
                    without={null}
                    filtersToExclude={[WITH_FILTER, WITHOUT_FILTER]}
                    disableHeader={true}
                />
            </>
        );
    }
}

export default ProfileWorkstation;