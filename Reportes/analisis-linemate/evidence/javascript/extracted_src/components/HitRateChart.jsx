import React from 'react';

import { ResponsiveBar } from '@nivo/bar';
import GlobalContext from './GlobalContext';

import './HitRateChart.scss'
import './App.scss'
import { RESPONSIVE_BAR_THEME } from '../react-web-constants';

/**
 * Props
 * - graphData: []
 * - graphLegendKeys: []
 * - line: number
 */
class HitRateChart extends React.Component {

    static contextType = GlobalContext;
    

    render() {
        const graphDataByDate = [...this.props.graphData];
        return (
            <div className='hit-rate-chart-wrapper' style={{width: '100%'}}>
                <ResponsiveBar
                    theme={RESPONSIVE_BAR_THEME}
                    data={graphDataByDate}
                    keys={this.props.graphLegendKeys}
                    indexBy="key"
                    margin={this.props.margin || { top: 20, right: 0, bottom: 10, left: 29 }}
                    padding={0.35}
                    innerPadding={10}
                    groupMode="grouped"
                    valueScale={{ type: 'linear' }}
                    indexScale={{ type: 'band', round: true }}
                    valueFormat={{ format: '', enabled: false }}
                    colors={({ id, data }) => String(data[`color`])}
                    defs={[]}
                    fill={[]}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={this.props.axisBottom || null}
                    axisLeft={this.props.axisLeft || {
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: '',
                        legendPosition: 'middle',
                        legendOffset: -40,
                    }}
                    enableLabel={false}
                    labelSkipWidth={12}
                    labelSkipHeight={12}
                    /*legends={[
                        {
                            dataFrom: 'keys',
                            anchor: 'top-right',
                            direction: 'row',
                            justify: false,
                            translateX: -10,
                            translateY: -50,
                            itemsSpacing: 4,
                            itemWidth: 100,
                            itemHeight: 32,
                            itemDirection: 'left-to-right',
                            itemOpacity: 0.85,
                            symbolSize: 12,
                            effects: [
                                {
                                    on: 'hover',
                                    style: {
                                        itemOpacity: 1
                                    }
                                }
                            ]
                        }
                    ]}*/
                    tooltip={this.props.tooltip}
                    markers={Number.isFinite(this.props.line) ? [
                        {
                            axis: 'y',
                            value: this.props.line,
                            lineStyle: { stroke: 'var(--color-opposite-border-default)', strokeWidth: 2 }
                        },
                    ] : []}
                    motionConfig={{ mass: 1, tension: 170, friction: 26, clamp: false, precision: 0.01, velocity: 0 }}
                />
            </div>
        );
    }
}

export default HitRateChart;