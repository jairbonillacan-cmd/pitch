import React from 'react';

import '../components/App.scss'
import _ from 'lodash';
import { fetchPlayerRecord, getPlayerName } from '../linemate-react-common/src/util';
import { API_HOST } from '../react-web-constants';
import GlobalContext from './GlobalContext';
import Trends from '../pages/Trends';

// For now this is just for player
class StatsProfile extends React.Component {

    static contextType = GlobalContext;

    constructor(props) {
        super(props)

        this.state = {
            player: null
        }
    }

    componentDidMount() {
        // We are fetching it twice, once here and once later in trends workstation but we don't have much of a choice without refactoring some of the generic workstation code
        fetchPlayerRecord(API_HOST, this.context.league, this.props.playerId, false)
        .then(response => this.setState({player: response}))
        .catch(console.error)
    }

    render() {
        if (!this.state.player) {
            return (<></>)
        }
        return (
            <Trends {...this.props} player={this.state.player} teamCode={this.state.player.teamCode} title='Profile' subtitle={getPlayerName(this.state.player)}/>
        );
    }
}

export default StatsProfile;